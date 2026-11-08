#!/usr/bin/env node
// ordo-continuity: the goal survives compaction, and subagents come back small.
//
// WHY, measured on 1,510 real Claude Code sessions (docs/CONTINUITY.md): auto-compaction fired at a median
// 748k tokens, and the summary kept 42% of the distinctive words in the user's own requests, 7% verbatim.
// After that the model works from a paraphrase of what it was asked, which reads as "it ignored me" and
// "it forgot". The fix is not a better model. It is keeping the user's words and the working state ON DISK,
// steering the summarizer, and putting both back after every compaction.
//
// One file, dispatched on hook_event_name. Never blocks, never throws, always exits 0.
//   UserPromptSubmit  log the prompt verbatim; on a long task point at the anchor; context bands
//   PostToolUse       context bands only (reads the transcript tail)
//   PreCompact        stdout = instructions to the summarizer (keep requests+status, decisions, failures)
//   SessionStart      source=compact: re-inject anchor + the user's requests verbatim + git state
//   PostCompact       audit what the summary kept -> $ORDO_HOME/compactions.tsv (costs no tokens)
//   SubagentStart     return contract + the parent's goal line
//
// State: $ORDO_HOME (default ~/.ordo) /sessions/<session_id>/{intent.jsonl, anchor.md, state.json}
// Every injection is clipped under the harness cap (10,000 chars; past it you get a 2,000-char preview).

import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, statSync, openSync, readSync, closeSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const CAP = 9500;
const FRESH_MS = 20 * 60e3;   // an anchor touched this recently needs no nudge
const home = () => process.env.ORDO_HOME || join(homedir(), ".ordo");
const bands = () => (process.env.ORDO_BANDS || "150,300,450,600,750").split(",").map((k) => +k * 1000).filter((n) => n > 0);

export const MACHINE = ["<task-notification", "<scheduled-task", "<cross-session", "<agent-message", "Another Claude session sent",
  "Stop hook feedback", "Base directory for this skill", "This session is being continued", "<system-reminder",
  "[SYSTEM NOTIFICATION", "<command-", "<local-command", "Caveat:", "<side-sessions-event", "<ci-monitor-event"];
export const isMachine = (s) => { const t = String(s).trimStart(); return MACHINE.some((m) => t.startsWith(m)); };

export const clip = (s, n) => (s.length <= n ? s : s.slice(0, n - 40).trimEnd() + ` [+${s.length - n + 40} chars clipped]`);
const one = (s, n) => clip(String(s).replace(/\s+/g, " ").trim(), n);
const readText = (f) => { try { return readFileSync(f, "utf8"); } catch { return ""; } };
const readJSON = (f, d) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return d; } };

export function paths(sid) {
  const dir = join(home(), "sessions", String(sid || "unknown").replace(/[^\w.-]/g, "_"));
  return { dir, intent: join(dir, "intent.jsonl"), anchor: join(dir, "anchor.md"), state: join(dir, "state.json") };
}
const writeState = (p, st) => { mkdirSync(p.dir, { recursive: true }); writeFileSync(p.state, JSON.stringify(st)); };
const anchorAge = (p) => { try { return Date.now() - statSync(p.anchor).mtimeMs; } catch { return null; } };
const ago = (ms) => (ms < 60e3 ? "<1m" : ms < 36e5 ? `${Math.round(ms / 60e3)}m` : `${Math.round(ms / 36e5)}h`);

export function readIntent(p) {
  return readText(p.intent).split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}
function logIntent(p, text) {
  mkdirSync(p.dir, { recursive: true });
  const n = readText(p.intent).split("\n").filter(Boolean).length + 1;
  appendFileSync(p.intent, JSON.stringify({ n, ts: new Date().toISOString(), text: text.slice(0, 20000) }) + "\n");
}

// Same rule as classifyTask in src/index.js (a test pins the two together): LIGHT unless a hard signal fires.
export function signals(prompt) {
  const t = String(prompt).replace(/```[\s\S]*?```/g, " ").toLowerCase();
  return {
    irreversible: /\b(deploy|publish|migrat\w*|drop table|rm -rf|force[- ]push|git push|production)\b/.test(t),
    realFork: /\b(versus|vs\.?|trade-?offs?|which (?:one|approach|option)|should we (?:use|pick|go))\b/.test(t),
    longHorizon: /\b(refactor|migrat\w*|rewrite|overhaul|audit|sweep|end-to-end|whole (?:repo|codebase|system)|until (?:it'?s )?done|keep going|long[- ]term)\b/.test(t),
    broad: /\b(every|all (?:the )?(?:files?|tests?|routes?|pages?)|across the|codebase|repo-wide)\b/.test(t),
    loadBearing: /\b(auth\w*|password|secret|api[- ]?key|credential|payment|billing|gdpr|pii|security|invoice)\b/.test(t),
  };
}
export const isLong = (prompt) => Object.values(signals(prompt)).some(Boolean) || String(prompt).length > 1200;

// Context = what the last main-thread request carried. A compact_boundary after it means the window was reset.
export function lastContext(transcript) {
  try {
    if (!transcript || !existsSync(transcript)) return 0;
    const size = statSync(transcript).size, len = Math.min(size, 512 * 1024), buf = Buffer.alloc(len);
    const fd = openSync(transcript, "r");
    try { readSync(fd, buf, 0, len, size - len); } finally { closeSync(fd); }
    const lines = buf.toString("utf8").split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      const l = lines[i];
      if (l.includes('"compact_boundary"')) return 0;
      if (!l.includes('"usage"')) continue;
      let o; try { o = JSON.parse(l); } catch { continue; }
      const u = o.type === "assistant" && !o.isSidechain && o.message?.usage;
      if (u) return (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0);
    }
  } catch {}
  return 0;
}

function bandNudge(p, ctx) {
  if (!ctx) return "";
  const st = readJSON(p.state, {}), crossed = new Set(st.bands || []);
  const hit = bands().filter((b) => ctx >= b && !crossed.has(b));
  if (!hit.length) return "";
  hit.forEach((b) => crossed.add(b));
  writeState(p, { ...st, bands: [...crossed], ctx });
  const age = anchorAge(p);
  if (age !== null && age < FRESH_MS) return "";
  return `[ordo] context ${Math.round(ctx / 1000)}k tokens. ${age === null ? "Create" : "Update"} the anchor now: ${p.anchor} `
    + "(GOAL in the user's words, DONE with proof, NEXT, DECISIONS, FAILED). It is re-injected after compaction; this window is not.";
}

// Sentences that carry a rule. Words, not a model: cheap, deterministic, and it under-reads rather than invents.
const RULE = /\b(never|always|don'?t|do not|must|only|make sure|no more|stop|instead|prefer|avoid|keep|without)\b/i;
export const constraints = (text) => String(text).split(/(?<=[.!?\n])\s+/).map((s) => s.trim()).filter((s) => s.length > 8 && RULE.test(s));

// ---- recall audit (same keyword rule as tools/continuity_scan.py) ----
const STOP = new Set("about above after again against because before being below between could doing during further having into itself more most other should their theirs them themselves then there these they this those through under until very were what when where which while would your yours also just like make want need sure think thing things dont cant that with from have will".split(" "));
export const keywords = (s) => new Set((String(s).toLowerCase().match(/[a-z][a-z0-9_\-./]{5,}/g) || []).filter((w) => !STOP.has(w)));
export function recall(prompts, summary) {
  const s = String(summary).toLowerCase(); const hits = [];
  for (const t of prompts) { const k = [...keywords(t)]; if (k.length) hits.push(k.filter((w) => s.includes(w)).length / k.length); }
  const verb = prompts.length ? prompts.filter((t) => s.includes(t.trim().slice(0, 80).toLowerCase())).length / prompts.length : 0;
  return { recall: hits.length ? hits.reduce((a, b) => a + b, 0) / hits.length : null, verbatim: verb };
}

// ---- restore: anchor + the user's words, budgeted under the cap ----
export function restore(p, cwd) {
  const head = "[ordo] Context was compacted. Read back from disk; on facts and on what the user asked, this beats the summary above.";
  const age = anchorAge(p);
  const anchor = age === null
    ? `No anchor yet. If this is a multi-step task, write one now at ${p.anchor} (GOAL in the user's words, PLAN, DONE, NEXT, DECISIONS, FAILED).`
    : `ANCHOR · ${p.anchor} · updated ${ago(age)} ago\n${clip(readText(p.anchor).trim(), 3500)}`;
  const git = gitState(cwd);
  const all = readIntent(p);
  let budget = CAP - head.length - anchor.length - git.length - 200;
  const pick = new Map();   // n -> rendered line
  const take = (x, n) => { const s = `#${x.n} ${clip(x.text.trim(), n)}`; if (s.length + 1 <= budget) { pick.set(x.n, s); budget -= s.length + 1; return true; } return false; };
  if (all.length) take(all[0], 1800);
  for (const x of all.slice(-4).reverse()) if (!pick.has(x.n)) take(x, 900);
  // The middle, newest first, in two halves of what is left: the rule sentences ("never X", "always Y"; a dropped
  // one is what reads as "it ignored me"), then the openings of the other requests. Measured against the
  // alternatives on 527 real compactions in docs/CONTINUITY.md.
  const mid = all.slice(1, -4).reverse();
  const half = budget / 2;
  for (const x of mid) {
    const rule = constraints(x.text);
    if (!rule.length || pick.has(x.n)) continue;
    if (budget < half || !take({ ...x, text: one(rule.join(" … "), 300) }, 310)) break;
  }
  for (const x of mid) if (!pick.has(x.n) && !take({ ...x, text: one(x.text, 160) }, 170)) break;
  const omitted = all.length - pick.size;
  const reqs = all.length
    ? [`YOUR REQUESTS, verbatim (${all.length} total${omitted ? `, ${omitted} not shown` : ""}; full log ${p.intent})`,
       ...all.filter((x) => pick.has(x.n)).map((x) => pick.get(x.n))].join("\n")
    : "";
  return clip([head, anchor, reqs, git].filter(Boolean).join("\n\n"), CAP);
}
function gitState(cwd) {
  const g = (...a) => { try { return execFileSync("git", ["-C", cwd, ...a], { encoding: "utf8", timeout: 3000, stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
  if (!cwd) return "";
  const headLine = g("log", "-1", "--format=%h %s"); if (!headLine) return "";
  const dirty = g("status", "--short").split("\n").filter(Boolean);
  return `GIT · ${cwd}\nHEAD ${one(headLine, 140)}` + (dirty.length ? `\nDIRTY (${dirty.length}): ${dirty.slice(0, 10).map((l) => l.trim()).join(" · ")}` : "");
}

export function compactInstructions(p) {
  const n = readIntent(p).length, anchor = readText(p.anchor).trim();
  const out = [
    "ORDO compaction contract. This summary is the next turn's only memory of the conversation. Keep, in this order:",
    "1. REQUESTS: every request the user made, one line each, with status done / open / dropped, and the proof for done (commit sha, test line, file).",
    "2. CONSTRAINTS: every rule, preference and correction the user stated, in their words. Never soften or merge them.",
    "3. DECISIONS taken and why. Approaches that FAILED and why, so they are not retried.",
    "4. STATE: what is in progress and the exact next step.",
    "5. IDENTIFIERS: exact file paths, commands, ids, URLs, numbers, branch names.",
    "Drop: tool output bodies and file contents (they can be re-read), narration, dead-end detail beyond a one-line verdict.",
    `The user's messages are saved verbatim (${n} so far, ${p.intent}) and are re-injected after this summary, as is the anchor. Do not copy them out; record what they do not say: status, decisions, failures.`,
  ];
  if (anchor) out.push("", "CURRENT ANCHOR (already persisted, do not restate):", clip(anchor, 4000));
  return clip(out.join("\n"), CAP);
}

export function subagentContract(p) {
  const goal = (readText(p.anchor).match(/^GOAL[^\n]*(?:\n(?![A-Z]{3,}\b)[^\n]+)*/m) || [""])[0];
  return ["[ordo] Subagent return contract: lead with the answer; at most 300 words unless the brief sets a size; rows as TSV;",
    "cite path:line; write anything longer to a file and return its path; name what you could not verify.",
    goal ? `Parent ${one(goal, 400)}` : ""].filter(Boolean).join(" ");
}

function audit(p, inp) {
  const st = readJSON(p.state, {}), prompts = readIntent(p).map((x) => x.text);
  const r = recall(prompts, inp.compact_summary || "");
  const f = join(home(), "compactions.tsv");
  mkdirSync(home(), { recursive: true });
  if (!existsSync(f)) appendFileSync(f, "ts\tsession\ttrigger\tctx_before\tprompts\trecall\tverbatim\tsummary_chars\tanchor_chars\n");
  appendFileSync(f, [new Date().toISOString(), String(inp.session_id).slice(0, 8), inp.trigger || "", st.preCompact?.ctx ?? "",
    prompts.length, r.recall == null ? "" : r.recall.toFixed(3), r.verbatim.toFixed(3),
    String(inp.compact_summary || "").length, readText(p.anchor).length].join("\t") + "\n");
}

// Returns what the hook prints, or "" for nothing.
export function handle(inp) {
  const ev = inp?.hook_event_name, p = paths(inp?.session_id), sub = Boolean(inp?.agent_id);
  const ctxOut = (text) => (text ? JSON.stringify({ hookSpecificOutput: { hookEventName: ev, additionalContext: clip(text, CAP) } }) : "");
  switch (ev) {
    case "UserPromptSubmit": {
      const prompt = String(inp.prompt || "");
      if (!prompt.trim() || isMachine(prompt)) return "";
      logIntent(p, prompt);
      const out = [];
      const age = anchorAge(p);
      if (isLong(prompt) && (age === null || age > FRESH_MS))
        out.push(`[ordo] long task. Before the first edit, write the anchor ${p.anchor}: GOAL in the user's words, PLAN, DONE-WHEN. `
          + "Update it at each phase and before you stop. After a compaction it is re-injected and outranks the summary.");
      const nudge = bandNudge(p, lastContext(inp.transcript_path));
      if (nudge) out.push(nudge);
      return ctxOut(out.join("\n"));
    }
    case "PostToolUse":
      return sub ? "" : ctxOut(bandNudge(p, lastContext(inp.transcript_path)));
    case "PreCompact": {
      const st = readJSON(p.state, {});
      writeState(p, { ...st, preCompact: { ts: Date.now(), trigger: inp.trigger, ctx: lastContext(inp.transcript_path) } });
      return compactInstructions(p);
    }
    case "PostCompact":
      audit(p, inp); return "";
    case "SessionStart": {
      if (inp.source !== "compact" || sub) return "";
      const st = readJSON(p.state, {});
      writeState(p, { ...st, bands: [], epoch: (st.epoch || 0) + 1 });
      return ctxOut(restore(p, inp.cwd));
    }
    case "SubagentStart":
      return ctxOut(subagentContract(p));
    default:
      return "";
  }
}

const isMain = (() => { try { return process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } })();
if (isMain) {
  let out = "";
  try { out = handle(JSON.parse(readFileSync(0, "utf8"))); } catch {}
  if (out) process.stdout.write(out);
  process.exit(0);
}
