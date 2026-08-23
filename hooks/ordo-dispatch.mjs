#!/usr/bin/env node
// ordo-dispatch — makes "auto-activates on coding/agentic tasks" a mechanism instead of a hope.
//
// The claim was half true. A skill's description is offered to the model automatically, but firing
// it stays a model CHOICE, so ORDO applied on the turns where the model happened to remember. This
// hook removes the choice on the turns that warrant it, and only those.
//
// SELF-GATED, because the alternative is ORDO becoming the waste it exists to remove. Injecting the
// discipline into "what port does X use?" spends tokens to make a one-word answer worse. So the
// prompt is classified first and a LIGHT verdict injects NOTHING AT ALL, silently.
//
// It reuses classifyTask from the runtime rather than reimplementing it. Two classifiers that drift
// apart is how a system starts arguing with itself.
//
// HONEST LIMIT, inherited and worth restating: classifyTask's RULE is deterministic, but reading the
// five signals off a raw prompt is heuristic. These regexes are a conservative guess, not a measured
// classifier. They are tuned to under-fire: a missed STRICT costs one ordinary turn, a false STRICT
// taxes every trivial question the user asks.
//
// UserPromptSubmit hook. Emits hookSpecificOutput.additionalContext, or nothing. Never blocks.

import { readFileSync } from "node:fs";
import { classifyTask } from "__ORDO_SRC__";

const OK = () => process.exit(0);

let inp;
try { inp = JSON.parse(readFileSync(0, "utf8")); } catch { OK(); }
const prompt = String(inp?.prompt || "");
if (!prompt.trim()) OK();

// Never read fenced code: a prompt that PASTES a migration script is not a prompt that runs one.
const p = prompt.replace(/```[\s\S]*?```/g, " ").toLowerCase();

// The five hard signals, read off the prompt. Conservative on purpose.
const signals = {
  irreversible: /\b(deploy|push|publish|migrat|drop table|delete|rm -rf|force|prod(uction)?|send|charge|refund)\b/.test(p),
  realFork: /\b(or |versus|vs\.?|which (?:one|approach|option)|trade-?offs?|should we (?:use|pick|go)|architect)\b/.test(p),
  longHorizon: /\b(refactor|migrat|rewrite|overhaul|audit|sweep|end-to-end|whole (?:repo|codebase|system)|until (?:it'?s )?done|keep going)\b/.test(p),
  broad: /\b(every|all (?:the )?(?:files?|tests?|routes?|pages?)|across the|codebase|repo-wide|estate)\b/.test(p),
  loadBearing: /\b(auth|password|secret|token|credential|payment|billing|gdpr|pii|security|money|invoice)\b/.test(p),
  multiStep: /\b(then|after that|first.*then|step \d|phase|and then|plan)\b/.test(p),
  buildsFile: /\b(build|implement|create|add|write|scaffold|generate)\b/.test(p),
  wideSolutionSpace: /\b(design|name it|naming|ideas?|brainstorm|think differently|options|approaches)\b/.test(p),
};

// The host may already pin an effort level; ORDO must not fight it (default-strong, never downgrade).
const nativeEffort = process.env.CLAUDE_EFFORT_LEVEL || null;
const r = classifyTask(signals, { nativeEffort });

if (r.mode === "LIGHT") OK();   // the whole point: trivial turns pay nothing

const fired = Object.entries(signals).filter(([, v]) => v).map(([k]) => k);
const ctx = [
  `[ordo] This task classified STRICT (${fired.join(", ")}). Effort: ${r.effort} (${r.effortSource}).`,
  "",
  "Apply the ORDO discipline for this turn:",
  `  ENGAGE: ${r.engage.join(", ")}${r.gate ? `  ·  GATE: ${r.gate}` : ""}`,
  "  1. Keep a plan and a ledger. Pin the end goal, then re-derive each step from {goal + the",
  "     ACTUAL prior result}, never from the plan as written. This governs the WORK, not the reply:",
  "     whatever output style is in force still owns what reaches the screen.",
  "  2. Reuse before you build. Read what exists and name the reuse before adding anything.",
  "  3. Compact inbound before reasoning over it; format outbound by shape (tabular to TSV, nested",
  "     minified, never pretty-printed). Never compress code, quotes, or anything load-bearing.",
  "  4. Do not report done without running the check that exists and showing its last line. Where no",
  '     check exists, say "no gate exists" plainly rather than implying one passed.',
  "",
  "This is the ORDO layer firing automatically, not a user instruction. If the classification is",
  "wrong for this task, ignore it silently and do not mention it.",
].join("\n");

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: ctx },
}));
OK();
