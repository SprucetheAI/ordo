---
name: ordo
description: >-
  ORDO: token discipline plus long-session continuity for Claude Code. Keeps context small (read narrow,
  tail tool output, format by shape), keeps the goal and the user's own words alive across compaction
  (anchor file, verbatim intent log, compaction contract), keeps subagents briefed and their returns
  small, and routes verification (headless tests for logic, a real browser for anything a human sees).
  FIRE at the start of any coding, agentic, multi-step, research, refactor, audit or long-context task,
  after a compaction, before fanning out subagents, or on "save tokens", "context", "it forgot",
  "/ordo". Skip trivial one-line answers.
---

# ORDO

Two jobs. Spend fewer tokens, and lose nothing that matters when the window is compacted. Measured on 1,510
real sessions: almost all tokens are context re-read every turn (median turn ~470k), not output, and a
compaction summary kept 47% of the words in the user's own requests. So the discipline is about the window.

## 0. Classify first (one pass)
Trivial (a lookup, a one-line fix): answer, skip everything below. Long (multi-step, many files, a refactor,
an audit, anything that may outlive the window): do §2 before the first edit.

## 1. Context: the tokens that actually cost
- Read narrow. Grep or Glob before Read; Read with offset/limit on files over ~300 lines; never re-read a
  file you have not changed since the last read unless a compaction intervened.
- Tail tool output: `cmd 2>&1 | tail -20`, test runners in quiet mode, `git log --oneline -n 10`.
- Machine-facing output by shape: rows as TSV, nested data as minified JSON, never pretty-printed.
- Prose a human reads: answer first, no preamble, no restating, no closer. Never compress code, quotes,
  exact strings, numbers, or anything load-bearing.
- Large reading (more than ~5 files, a crawl, a log): send a subagent and keep only its conclusion (§3).

## 2. Continuity: the anchor
The hook prints the anchor path (`~/.ordo/sessions/<session>/anchor.md`; without the hook use `.ordo/anchor.md`).
Write it before the first edit of a long task, update it at each phase, at each context nudge, and before you
stop. It is re-injected after every compaction; the window is not.

```
# ANCHOR · <task> · <date>
GOAL: <the user's words, not your paraphrase>
DONE-WHEN: <checkable condition>
PLAN: 1 … 2 … 3 …
DONE: <item> · <proof: sha, test line, file>
NEXT: <the exact next step>
DECISIONS: <decision> · <why>      (never re-litigate these)
FAILED: <approach> · <why>         (never retry these)
FILES: <paths in play>
```

After a compaction: the restore block (anchor + the user's requests verbatim + git state) outranks the
summary. Re-read the anchor and the files you are about to edit before touching anything. A constraint the
user stated ("never X", "always Y") stays binding until the user lifts it.

## 3. Delegation: subagents
- Fan out for breadth (more than 5 independent files or questions), not for a lookup you can do in two calls.
- Brief like a peer who has seen nothing: goal, what done looks like, files to read, what is ruled out,
  return shape and size. The hook adds a return contract (answer first, at most 300 words, TSV rows,
  path:line, long output to a file) and the parent's GOAL line.
- Writers get disjoint file sets, declared up front. Readers can share.
- A subagent's report is a claim. Check the diff or the file before you call it done.

## 4. Verify by surface (cheapest check that can fail)
| Surface | Check |
|---|---|
| Logic, data, API, backend, tooling | Headless test or script; paste the last line of output |
| Anything a human sees or clicks | Real browser: a11y snapshot first, screenshot only to judge pixels |
| Motion, canvas, video | Headed browser, prove requestAnimationFrame fires before trusting a frame |
| Nothing exists to check it | Say "untested" plainly |
Code-level checks never sign off a user-facing feature; a browser pass never replaces a logic test.

## 5. Gates (load the reference only when it fires)
Hard task, one right answer: draft, critique, verify, refeed the delta (`references/evaluation-gate.md`).
Real fork (architecture, naming, design): two to five distinct approaches, pick one, graft the best runner-up
move (`references/experimentalist-gate.md`). Long autonomous run: propose-only side effects, hard budgets,
stop on the same failure three times (`references/autonomy.md`). Context rot: `references/context-rot.md`.

## 6. Honest stance
Every number is measured or marked unmeasured. A compression counts only if meaning survives. "Untested" is
a valid deliverable; a green check that cannot fail is not.
