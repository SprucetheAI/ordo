#!/usr/bin/env node
// ordo-enforce — the Stop hook that makes ORDO's gates enforced instead of advisory.
//
// AGENTS.md has always admitted the hole: "The gates are SOPs you apply, not code that runs."
// An SOP an agent can silently skip is a suggestion. This closes two of those skips, and only two,
// because they are the two that produce a CONFIDENT WRONG REPORT rather than a slow one:
//
//   VACUOUS   the turn shows gate-shaped output that came from a run which executed nothing
//             (--collect-only, --dry-run, "no tests ran", "0 passed"). It matches every
//             result-shaped pattern a checker looks for and proves nothing at all.
//   NARRATED  the turn announced work and then stopped without doing any of it. No edit, no
//             write, no command. The human is then expected to reply "yes, go ahead" to a step
//             the agent had already decided was correct.
//
// Method grafted from Leonxlnx/unlazy (MIT): evidence is bound to the conditions that produced it,
// an impossible check is ABANDONED with a reason rather than deleted, and the enforcer releases
// itself after N blocks so it can never trap a session.
//
// DESIGN LAW, learned the expensive way: this errs toward ALLOWING. A false positive blocks
// legitimate work and teaches the user to rip the hook out, after which it enforces nothing
// forever. A false negative leaves you exactly where you already were. Every failure path exits 0.
//
// Reads Claude Code's Stop-hook JSON on stdin. Emits {decision:"block", reason} or nothing.

import { readFileSync, openSync, readSync, fstatSync, closeSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const MAX_BLOCKS = 4;      // self-release: never trap a session on the same wall
const TAIL_BYTES = 2 << 20; // 2MB. A -Tail style scan costs seconds on a 100MB+ transcript.

const OK = () => process.exit(0);

/** A result that ran nothing still prints like a result. This is the whole point of the rule. */
const VACUOUS = /--collect-only|--collect_only|\bcollect-only\b|--dry-run|--list-tests|\bno tests ran\b|\b0 passed\b|\bcollected 0 items\b/i;

/** Gate-shaped output: a number or a tool-emitted result shape, never a bare English word. A prose
 *  "pass" or a README mentioning `npm test` is not evidence, and accepting those was measured to
 *  short-circuit most evaluations in the hook this was grafted from. */
const PROOF = [
  /\d+\s+passed/, /\d+\s+failed/, /Found \d+ error/, /error TS\d+/, /Test Files\s+\d+/,
  /collected \d+ item/, /built in \d/, /no issues found/, /Ran all test suites/,
  /\d+ passing/, /FAILED \S+::/, /\d+ (?:problems?|warnings?|errors?)\b/,
];

/** Tools that can change the world. Read/Grep/Glob deliberately absent: reading is not doing. */
const MUTATORS = /^(Edit|Write|MultiEdit|NotebookEdit|Bash|PowerShell|Task)$/;

/** "I will do X" with nothing done. Present tense and questions are NOT here on purpose. */
const INTENT = [
  /\bI'?ll (?:now |then |go ahead and |start |first |next )?\w/i,
  /\bI will (?:now |then |go ahead and |start |first |next )?\w/i,
  /\bnext,? I(?:'?ll| will)\b/i, /\bthe next step is\b/i,
  /\blet me (?:now |first |go |start |run )/i, /\bI'?m going to\b/i, /\bI plan to\b/i,
];

/** Anything that makes forward tense legitimate: asking, proposing, or being blocked. A question
 *  mark alone releases the rule, because asking one good question is the correct move. */
const INTENT_VETO = /want me to|should i\b|shall i\b|your call|which (?:one|option)|\bi would\b|proposal|declare|recommend|if you approve|blocked on|awaiting|needs? (?:you|approval)|plan mode|here is the plan/i;

function tail(path) {
  const fd = openSync(path, "r");
  try {
    const size = fstatSync(fd).size;
    const take = Math.min(TAIL_BYTES, size);
    const buf = Buffer.alloc(take);
    readSync(fd, buf, 0, take, size - take);
    return buf.toString("utf8").split("\n");
  } finally { closeSync(fd); }
}

/** Session-keyed block counter, so a wall the agent cannot clear stops being a wall. */
function bump(stateDir, session) {
  try {
    const f = join(stateDir, "ordo-enforce-state.json");
    const s = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
    s[session] = (s[session] || 0) + 1;
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, JSON.stringify(s));
    return s[session];
  } catch { return 1; } // unreadable state must not become a trap
}

function block(reason) {
  process.stdout.write(JSON.stringify({ decision: "block", reason }));
  process.exit(0);
}

let raw = "";
try { raw = readFileSync(0, "utf8"); } catch { OK(); }
let inp; try { inp = JSON.parse(raw); } catch { OK(); }
if (!inp || inp.stop_hook_active) OK();          // loop guard
const tpath = inp.transcript_path;
if (!tpath || !existsSync(tpath)) OK();

let lines; try { lines = tail(tpath); } catch { OK(); }
if (lines.length > 300) lines = lines.slice(-300);

// TURN-BOUNDARY CUT. Evidence and action must come from THIS turn. The tail window routinely spans
// several turns, so without this a passing run from ten minutes ago vouches for a claim made now.
// The discriminator: a real human turn's message.content is a STRING; a tool result is a LIST of
// tool_result blocks. Both arrive as type "user".
let evidence = false, vacuous = false, acted = false, lastText = null;
for (const line of lines) {
  let o; try { o = JSON.parse(line); } catch { continue; }
  const content = o?.message?.content;
  if (o?.type === "user" && content) {
    const human = typeof content === "string"
      || (Array.isArray(content) && !content.some((b) => b?.type === "tool_result"));
    if (human) { evidence = false; vacuous = false; acted = false; lastText = null; }
  }
  if (o?.type === "assistant" && Array.isArray(content)) {
    const text = content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
    if (text) lastText = text;
    if (content.some((b) => b?.type === "tool_use" && MUTATORS.test(b.name || ""))) acted = true;
  }
  if (Array.isArray(content)) {
    const blob = content.filter((b) => b?.type === "tool_result")
      .map((b) => (typeof b.content === "string" ? b.content : (b.content || []).map((c) => c?.text).join("\n")))
      .join("\n");
    if (blob && PROOF.some((p) => p.test(blob))) { if (VACUOUS.test(blob)) vacuous = true; else evidence = true; }
  }
}
if (!lastText) OK();

// Never read code blocks: a claim quoted inside a diff is not a claim.
const plain = lastText.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

if (vacuous && !evidence) {
  if (bump(process.cwd() + "/.ordo", inp.session_id || "-") > MAX_BLOCKS) OK();
  block(
    "ordo-enforce: the only gate-shaped output in this turn is VACUOUS. It matched a result pattern " +
    "but came from a run that executed nothing (a --collect-only or --dry-run invocation, a " +
    '"no tests ran" result, or "0 passed").\n\n' +
    "Collecting is not running. Re-run the check so it actually executes, and record the resolved " +
    "working directory alongside the result, or state plainly that the run was vacuous and name what " +
    "is therefore still unproven. Do not report either way until one of those is true.\n\n" +
    "If the check genuinely cannot run, ABANDON it with a non-empty reason and surface that in the " +
    "report. A gate that quietly vanished is indistinguishable from a gate that passed."
  );
}

if (!acted && !/\?/.test(plain) && !INTENT_VETO.test(plain) && INTENT.some((r) => r.test(plain))) {
  if (bump(process.cwd() + "/.ordo", inp.session_id || "-") > MAX_BLOCKS) OK();
  block(
    "ordo-enforce: this turn announced work and then stopped without doing any of it. No edit, no " +
    "write, no command ran. Reading and searching are not doing.\n\n" +
    "Nobody should have to answer \"yes, go ahead\" to a step you already decided was correct. If you " +
    "know the next action and it is inside the scope you were given, take it now instead of " +
    "describing it.\n\n" +
    "Take exactly one of these, then stop:\n" +
    "1. DO IT. Execute the step you just described, then report what changed.\n" +
    "2. If it is a real fork with genuine trade-offs, or it spends money, ASK ONE QUESTION with a " +
    "recommendation attached. A question mark releases this gate.\n" +
    "3. If it is blocked on a decision or a secret you do not have, say so in one line and name what " +
    "it unblocks, then move to the next thing you CAN do.\n\n" +
    "Announcing intent is not progress."
  );
}

OK();
