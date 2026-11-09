// Pins the continuity hook. Each test names the failure it prevents.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handle, paths, readIntent, lastContext, recall, signals, isLong, bands, clipMid } from "../hooks/ordo-continuity.mjs";
import { classifyTask } from "../src/index.js";

let dir;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "ordo-cont-")); process.env.ORDO_HOME = dir; for (const k of ["ORDO_BANDS", "ORDO_BIG_RESULT", "CLAUDE_CODE_AUTO_COMPACT_WINDOW"]) delete process.env[k]; });
const sid = "s-test";
const ctxOf = (out) => (out ? JSON.parse(out).hookSpecificOutput.additionalContext : "");
const transcript = (tokens, extra = []) => {
  const f = join(dir, "t.jsonl");
  const a = (n) => JSON.stringify({ type: "assistant", message: { usage: { input_tokens: 2, cache_read_input_tokens: n - 2, cache_creation_input_tokens: 0 } } });
  writeFileSync(f, [JSON.stringify({ type: "user", message: { content: "hi" } }), a(tokens), ...extra].join("\n") + "\n");
  return f;
};
const prompt = (text, t) => handle({ hook_event_name: "UserPromptSubmit", session_id: sid, prompt: text, transcript_path: t });

test("the user's words are logged verbatim; machine turns are not", () => {
  prompt("Use port 8443 and never touch config/prod.yml");
  prompt("<task-notification><task-id>x</task-id></task-notification>");
  prompt("[SYSTEM NOTIFICATION - NOT USER INPUT] background done");
  const log = readIntent(paths(sid));
  assert.equal(log.length, 1);
  assert.equal(log[0].text, "Use port 8443 and never touch config/prod.yml");
});

test("a long task gets the anchor pointer once; a trivial question gets nothing", () => {
  assert.equal(prompt("what port does the api use?"), "");
  const out = ctxOf(prompt("refactor the auth module across the codebase"));
  assert.match(out, /long task/);
  assert.ok(out.includes(paths(sid).anchor));
  mkdirSync(paths(sid).dir, { recursive: true }); writeFileSync(paths(sid).anchor, "GOAL x");
  assert.equal(prompt("now refactor the billing module too"), "", "a fresh anchor needs no second pointer");
});

test("the hook's long-task rule agrees with classifyTask (no drifting twin classifiers)", () => {
  for (const p of ["what port?", "deploy to production", "refactor everything", "auth vs sessions, which approach", "fix the typo"]) {
    const s = signals(p);
    assert.equal(classifyTask(s).mode === "STRICT", Object.values(s).some(Boolean), p);
  }
  assert.equal(isLong("x".repeat(1300)), true, "a very long prompt is a long task whatever its words");
});

test("context bands: each band nudges once, a fresh anchor silences it", () => {
  const t = transcript(320000);
  const first = ctxOf(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: t }));
  assert.match(first, /context 320k tokens\. Create the anchor/);
  assert.equal(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: t }), "", "same band twice is noise");
  writeFileSync(paths(sid).anchor, "GOAL x");
  assert.equal(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(470000) }), "");
});

test("bands follow the compaction window; the last one warns before the cliff even with a fresh anchor", () => {
  process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = "400000";
  assert.deepEqual(bands(), [160000, 260000, 340000]);
  process.env.CLAUDE_CODE_AUTO_COMPACT_WINDOW = "400k";
  assert.deepEqual(bands(), [160000, 260000, 340000]);
  mkdirSync(paths(sid).dir, { recursive: true }); writeFileSync(paths(sid).anchor, "GOAL x");
  assert.equal(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(200000) }), "", "fresh anchor, early band: silent");
  const out = ctxOf(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(345000) }));
  assert.match(out, /compaction fires near 367k/); assert.match(out, /start no new large read/);
});

test("a fat anchor comes back head and tail, never head only; the nudge says it has become a log", () => {
  const fat = "GOAL: ship v4\n" + "DONE: step ".repeat(900) + "\nNEXT: write the README\nFAILED: approach A";
  mkdirSync(paths(sid).dir, { recursive: true }); writeFileSync(paths(sid).anchor, fat);
  const out = ctxOf(handle({ hook_event_name: "SessionStart", source: "compact", session_id: sid, cwd: dir }));
  for (const must of ["GOAL: ship v4", "NEXT: write the README", "FAILED: approach A", "of the middle not shown"]) assert.ok(out.includes(must), must);
  assert.ok(clipMid("x".repeat(9000), 3500).length <= 3500);
  assert.match(ctxOf(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(320000) })), /cut it to state/);
});

test("one huge tool result gets one line, at most twice per window; small ones and subagents get none", () => {
  const big = { hook_event_name: "PostToolUse", session_id: sid, tool_name: "Read", tool_response: "a line of code\n".repeat(5334) };
  assert.match(ctxOf(handle(big)), /Read result was ~20k tokens/);
  assert.ok(handle(big)); assert.equal(handle(big), "", "third time is nagging");
  const image = { type: "image", file: { base64: "iVBORw0KGgo".repeat(12000) } };
  assert.equal(handle({ ...big, session_id: "s4", tool_response: image }), "", "an image is ~1.5k tokens, not its base64 length");
  assert.equal(handle({ ...big, session_id: "s2", tool_response: "small" }), "");
  assert.equal(handle({ ...big, session_id: "s3", agent_id: "a1" }), "");
});

test("a subagent's compaction gets its own contract and writes no audit row", () => {
  prompt("never push without asking");
  const out = handle({ hook_event_name: "PreCompact", session_id: sid, agent_id: "a1", trigger: "auto" });
  assert.match(out, /subagent's window/); assert.ok(!out.includes("REQUESTS"));
  handle({ hook_event_name: "PostCompact", session_id: sid, agent_id: "a1", compact_summary: "x" });
  assert.ok(!existsSync(join(dir, "compactions.tsv")));
});

test("subagent tool calls never nudge (their context is disposable)", () => {
  assert.equal(handle({ hook_event_name: "PostToolUse", session_id: sid, agent_id: "a1", transcript_path: transcript(900000) }), "");
});

test("a compact_boundary after the last request reads as an empty window, not the old 750k", () => {
  const t = transcript(750000, [JSON.stringify({ type: "system", subtype: "compact_boundary" })]);
  assert.equal(lastContext(t), 0);
  assert.equal(lastContext(transcript(123456)), 123456);
});

test("PreCompact steers the summarizer: requests with status, constraints verbatim, failures, the anchor", () => {
  prompt("never push without asking");
  mkdirSync(paths(sid).dir, { recursive: true }); writeFileSync(paths(sid).anchor, "GOAL ship v3\nFAILED: approach A");
  const out = handle({ hook_event_name: "PreCompact", session_id: sid, trigger: "auto", transcript_path: transcript(700000) });
  for (const must of ["REQUESTS", "status done / open / dropped", "CONSTRAINTS", "FAILED", "re-injected after this summary", "approach A"]) assert.ok(out.includes(must), must);
  assert.ok(out.length <= 9500);
  assert.equal(JSON.parse(readFileSync(paths(sid).state, "utf8")).preCompact.ctx, 700000);
});

test("restore after compaction: first and latest requests verbatim, anchor, under the cap even with 300 long prompts", () => {
  prompt("MISSION: keep the original ask " + "a".repeat(500));
  for (let i = 2; i <= 300; i++) prompt(`request ${i} ` + "b".repeat(2000));
  prompt("LATEST: use TSV for the table");
  writeFileSync(paths(sid).anchor, "GOAL ship v3\nNEXT: write README");
  const out = ctxOf(handle({ hook_event_name: "SessionStart", source: "compact", session_id: sid, cwd: dir }));
  assert.ok(out.length <= 9500, `restore is ${out.length} chars`);
  for (const must of ["MISSION: keep the original ask", "LATEST: use TSV for the table", "NEXT: write README", "301 total"]) assert.ok(out.includes(must), must);
});

test("restore resets the bands, so the next window nudges again", () => {
  handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(320000) });
  handle({ hook_event_name: "SessionStart", source: "compact", session_id: sid, cwd: dir });
  assert.match(ctxOf(handle({ hook_event_name: "PostToolUse", session_id: sid, transcript_path: transcript(310000) })), /310k/);
});

test("a normal startup or resume injects nothing", () => {
  prompt("hello there, build the thing");
  assert.equal(handle({ hook_event_name: "SessionStart", source: "startup", session_id: sid }), "");
  assert.equal(handle({ hook_event_name: "SessionStart", source: "resume", session_id: sid }), "");
});

test("PostCompact audits recall of the user's words into a TSV, and prints nothing", () => {
  prompt("rename frobnicate to frobnicate_v2 in parser.py");
  const out = handle({ hook_event_name: "PostCompact", session_id: sid, trigger: "auto", compact_summary: "User asked to rename frobnicate in parser.py" });
  assert.equal(out, "");
  const rows = readFileSync(join(dir, "compactions.tsv"), "utf8").trim().split("\n");
  assert.equal(rows.length, 2);
  assert.ok(+rows[1].split("\t")[5] > 0.3);
});

test("recall: verbatim and keyword measures behave", () => {
  const r = recall(["use the staging database please"], "the user said: use the staging database please");
  assert.equal(r.verbatim, 1); assert.equal(r.recall, 1);
  assert.equal(recall(["deploy kubernetes cluster"], "nothing relevant").recall, 0);
});

test("SubagentStart: return contract plus the parent's goal line", () => {
  mkdirSync(paths(sid).dir, { recursive: true }); writeFileSync(paths(sid).anchor, "# A\nGOAL: ship ORDO v3 continuity\nPLAN\n1 x");
  const out = ctxOf(handle({ hook_event_name: "SubagentStart", session_id: sid, agent_id: "a1", agent_type: "Explore" }));
  assert.match(out, /return contract/); assert.match(out, /instead of guessing/); assert.match(out, /ship ORDO v3 continuity/); assert.ok(!out.includes("1 x"));
});

test("garbage in never throws", () => {
  for (const x of [null, {}, { hook_event_name: "PreCompact" }, { hook_event_name: "UserPromptSubmit", prompt: 5 }, { hook_event_name: "PostToolUse", transcript_path: "/nope" }])
    assert.doesNotThrow(() => handle(x));
  assert.ok(!existsSync(join(dir, "sessions", "undefined")));
});
