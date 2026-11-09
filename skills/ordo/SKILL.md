---
name: ordo
description: >-
  ORDO: context discipline plus long-session continuity for Claude Code. Keeps the window small (read
  narrow, tail tool output, format by shape), keeps the goal and the user's own words alive across
  compaction (anchor file, verbatim intent log, compaction contract), runs a big plan as phases from a
  plan file, keeps subagents briefed and their returns small, and routes every check to the cheapest
  surface that can fail (headless for logic, a real browser for anything a human sees). FIRE at the
  start of any coding, agentic, multi-step, research, refactor, audit, video or long-context task, when
  handed a large plan, after a compaction, before fanning out subagents, or on "save tokens", "context",
  "it forgot", "going in circles", "/ordo". Skip trivial one-line answers.
---

# ORDO

Three jobs: keep the window small, lose nothing that matters when it is compacted, and land the work in one
pass so nothing is redone. Measured on 1,510 real sessions: almost every token is the window re-read on each
turn (median turn ~470k), and a compaction summary kept 47% of the words in the user's own requests. So cost
is window size times turns, and the expensive failure is redone work.

ORDO removes waste, never thought. It does not shorten reasoning on a hard problem, trim a deliverable the
user asked for, or narrow a creative search. Those are the work; everything below is about what surrounds it.

## 0. Classify first (one pass)
| Task | Do |
|---|---|
| Trivial: a lookup, a one-line answer | Answer and stop. Nothing below applies |
| Nimble: one defect, one file, a handful of tool calls | Read narrow, fix, run the one check, report. No anchor |
| Long: multi-step, many files, may outlive the window | Anchor before the first edit (§2) |
| Massive: a plan with phases, more than one window of work | Plan file, one phase per fresh context (§3) |

## 1. Context: keep it out, then keep it short-lived
Whatever enters the window is paid for again on every later turn until the next compaction.
- Read narrow. Grep or Glob before Read; offset/limit on files over ~300 lines; never re-read a file you have
  not changed since the last read unless a compaction intervened.
- Tail tool output: `cmd 2>&1 | tail -20`, test runners in quiet mode, `git log --oneline -n 10`.
- Large reading (more than ~5 files, a crawl, a log, a long doc): a subagent reads, you keep its conclusion.
- Bulk data never passes through the window. If rows or files only pass through you, pipe them file to file
  in a script and read the summary line.
- Law and reference live in docs. Grep the heading, read that section, cite the path. Never paste a doc into
  the anchor or keep it in the window because it might be needed again.
- Machine-facing output by shape: rows as TSV, nested data as minified JSON, never pretty-printed. Prose a
  human reads: answer first, no preamble, no restating, no closer. Never compress code, quotes, exact
  strings, numbers, or anything load-bearing.

The window: on a 1M model set `CLAUDE_CODE_AUTO_COMPACT_WINDOW` to about 400k. A fresh session already carries
100k+ (system prompt, tools, CLAUDE.md, skill list), so the working room is the window minus that. Much lower
and sessions thrash between compactions; much higher and every turn re-reads stale tool output. The cap is a
backstop. The levers that keep paying are a smaller base, less inflow, and compactions that land on a phase
boundary. The hook nudges at 40%, 65% and 85% of the window; at the last one, land the unit you are in,
update the anchor, and start no new large read.

## 2. Continuity: the anchor is state, not a log
The hook prints the anchor path (`~/.ordo/sessions/<session>/anchor.md`; without the hook use `.ordo/anchor.md`).
Write it before the first edit of a long task, update it at each phase, at each context nudge, and before you
stop. It is re-injected after every compaction; the window is not.

```
# ANCHOR · <task> · <date>
GOAL: <the user's words, not your paraphrase>
DONE-WHEN: <a condition someone else could check>
PLAN: 1 … 2 … 3 …          (or: PLAN FILE <path>, phase <n>)
DONE: <item> · <proof: sha, test line, file>     (one line each)
NEXT: <the exact next step>
DECISIONS: <decision> · <why>      (never re-litigate these)
FAILED: <approach> · <why>         (never retry these)
FILES: <paths in play>
```

Keep it under ~3,500 characters: that is what comes back, head and tail, when it is longer. When DONE grows,
collapse it; the detail already lives in commits, the ledger, or the plan file.

After a compaction the restore block (anchor + the user's requests verbatim + git state) outranks the summary.
Re-read the anchor and the files you are about to edit before touching anything. A constraint the user stated
("never X", "always Y") stays binding until the user lifts it.

## 3. A plan bigger than one window
- The plan is a file in the repo, not a message: phases, each with files, a DONE-WHEN and a status
  (`todo / doing / done + proof / blocked + why`). The anchor cites it. Ingest a large plan by section, into
  that table, never whole into the window.
- One phase, one fresh context: a subagent briefed with the plan path and its phase, or the main thread right
  after a compaction. The orchestrator holds the table and the verdicts, not the phase's reading.
- A phase is at most ~5 files. It ends with its check run, its status line flipped with the proof, and the
  anchor updated. A status flips only with proof; a skipped step is written as skipped.
- Phases that share no files run in parallel; phases that share files run in order.

## 4. Delegation: subagents
- Fan out for breadth (more than 5 independent files or questions), not for a lookup you can do in two calls.
- Brief like a peer who has seen nothing: goal, what done looks like, files to read, what is ruled out,
  return shape and size. The hook adds a return contract (answer first, at most 300 words, TSV rows,
  path:line, long output to a file) and the parent's GOAL line.
- Match the model to the weight: mechanical, fully specified work on a cheaper faster model; judgment, design
  and review on the strong one. Say which when you spawn.
- Writers get disjoint file sets, declared up front. Readers can share.
- A subagent's report is a claim. Check the diff or the file before you call it done.

## 5. Verify on the cheapest surface that can fail
| What you are proving | Where | Evidence |
|---|---|---|
| Logic, data, parsing, API, tooling | Headless: a test or a one-off script | Last line of output |
| Types, build, lint | The repo's own gate command | Last line of output |
| Page structure, text, console, network, layout numbers | Browser, a11y snapshot or evaluate; headless is fine | The values |
| Look: hierarchy, spacing, does it read | A real render, judged by eyes | The screenshot and a verdict |
| Motion, canvas, WebGL, drag, video playback | Headed visible window, requestAnimationFrame proven first | Frame timings |
| A video or audio file | Probe first (duration, streams, loudness, sampled frames on one sheet), then watch only the cuts in question | Probe lines |
| Nothing exists to check it | | Say "untested" plainly |

A test never signs off something a human sees; a screenshot never proves logic. One browser walks the whole
checklist. A check that will run twice becomes a script.

## 6. One pass, no circles
- Know DONE-WHEN before starting. One analysis pass, then act.
- A claim about code cites a line you read or a command you ran in this window. Anything else is labelled
  unverified, with what would verify it.
- DECISIONS are final unless the user reopens them. FAILED is not retried. The same wall twice means the
  third move is a question, not a variant.
- Before "done": run the check, paste its last line, name what was skipped.

## 7. Gates (load the reference only when it fires)
Hard task, one right answer: draft, critique, verify, refeed the delta (`references/evaluation-gate.md`).
Real fork (architecture, naming, design): two to five distinct approaches, pick one, graft the best runner-up
move (`references/experimentalist-gate.md`). Long autonomous run: propose-only side effects, hard budgets,
stop on the same failure three times (`references/autonomy.md`). Context rot: `references/context-rot.md`.

## 8. Honest stance
Every number is measured or marked unmeasured. A compression counts only if meaning survives. "Untested" is
a valid deliverable; a green check that cannot fail is not.
