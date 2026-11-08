STATUS: evidence for the v0.3 continuity layer
STAMP: 2026-11-08 · scan of 1,510 local sessions, replay of 527 compactions, two live headless A/B runs

# Continuity: what compaction loses, and what ORDO puts back

## Method

`tools/continuity_scan.py` reads Claude Code transcripts (`~/.claude/projects/*/*.jsonl`, main thread only,
subagents excluded, assistant entries deduplicated by `requestId` because one response is written as several
entries sharing one usage block). For every `compact_boundary` it keeps the user's genuine prompts before it
(machine turns such as task notifications and system reminders filtered out) and the summary that followed.

Three recall measures, all proxies for "the model can still see what it was asked":

| Measure | Definition |
|---|---|
| Keyword recall | Per prompt, share of its distinctive words (6+ characters, stopwords removed) present in the text; averaged over prompts |
| Verbatim recall | Share of prompts whose first 80 characters appear in the text exactly |
| Constraint recall | Keyword recall over rule sentences only: sentences containing never, always, don't, must, only, make sure, avoid, keep, instead, prefer, without, stop |

`tools/continuity_replay.mjs` feeds each compaction's prompts into the shipped `restore()` from
`hooks/ordo-continuity.mjs` (no anchor, the conservative case) and scores summary alone against summary + restore.

## The problem

| Measure (local sessions, Oct 1 to Nov 8, 2026) | Value |
|---|---|
| Context per request on a typical day (median) | ~450k to 490k tokens |
| Compaction trigger (median, 101 compactions since Oct 1) | 748k tokens; 37 of 101 were automatic |
| User prompts before a compaction (median) | 37 |
| Summary length (median) | 17.5k characters |
| Post-compaction re-reads of files read before it, within 60 tool calls (mean) | 0.74 files |

Re-reading after compaction is rare, so the cost of forgetting does not show up as re-reads. It shows up as work
built on a paraphrase of the request.

## Replay on 527 real compactions

| Restore variant (median) | Keyword | Verbatim | Constraint |
|---|---|---|---|
| Summary alone | 0.465 | 0.080 | 0.374 |
| + plain request openings | 0.699 | 0.640 | 0.504 |
| + rule sentences only | 0.668 | 0.377 | 0.621 |
| + opening and rules per line | 0.653 | 0.352 | 0.570 |
| **+ split budget (shipped)**: first request, last four, then half the rest to rule sentences, half to openings, newest first | **0.703** | **0.542** | **0.584** |

The shipped restore costs a median 2,300 tokens per compaction (characters / 4), against a window that was ~750k
before it. The split is the best keyword recall, second on verbatim and second on constraints; rules-only wins
constraints by 0.037 but gives up 0.165 of verbatim.

## Window size, modeled

`continuity_scan.py --window 400000` replays every session's per-request context growth with compaction at 400k.
Assumptions, stated in `model()`: a session grows by the same per-request increments it really did; a modeled
compaction drops the window to the session's first request size plus 8k tokens (summary plus restore) and costs
one pass over the full 400k.

| | Context tokens processed |
|---|---|
| Real (compaction at ~750k to 1M) | 133.0B |
| Modeled at 400k | 69.3B (−47.9%), 1,102 extra compactions |

Most of these are cache reads, which are cheap per token but still count against usage limits and still sit in
the model's attention.

## Live A/B, headless

Same scripted session twice with `claude -p --setting-sources project` (no global hooks), Opus 5.5, effort low:
six rules for a small tool spread over three turns, filler reading, one Explore subagent, a forced `/compact`, then
"write tally.py following every rule I gave you". Arm A has no hooks; arm B has ordo-continuity.

| Check | Arm A | Arm B |
|---|---|---|
| Compaction happened | yes, 98k | yes, 110k |
| Rules applied by the final answer (scored by script) | 6/6 | 6/6 |
| Model wrote an anchor on its own after the long-task pointer | n/a | yes, all six rules verbatim |
| PreCompact contract shaped the summary | default 9 sections | `1. REQUESTS:` structure |
| Restore present after compaction | n/a | yes |
| PostCompact audit row | n/a | recall 0.535 of the summary alone |
| Subagent received the return contract | no | yes |

Both arms pass at this size, as predicted: a 100k session with four prompts summarizes cleanly. The loss shows at
the 750k scale the replay measures; a live test at that scale costs real money and was not run. Run 1 failed to
compact at all because Git Bash rewrote `/compact` into `C:/Program Files/Git/compact` (fixed with
`MSYS_NO_PATHCONV=1`); without compaction both arms also scored 6/6. The summarizer adopted the contract's structure
but ignored an instruction to end with a fixed line, so that instruction was removed; the restore block already
names the anchor. Spend: $3.56 on the main transcripts of both runs by `ordo measure`; subagent and compaction
calls are not in that figure.

## Overhead

~150 ms per hook call on Windows, almost all Node startup, measured on a 4.4 MB transcript. PostToolUse is
matched to the tools that grow context (Read, Bash, Grep, Glob, Agent, WebFetch, WebSearch, MCP).

## Reproduce

```bash
python -I tools/continuity_scan.py --since 2026-10-01 --window 400000
node tools/continuity_replay.mjs
node --test test/continuity.test.mjs
```

## Limits

Recall is not correctness. One user's machine is not a population. The anchor is written by the model; the hooks
can prompt it and restore it, not author it. Hook output is capped at 10,000 characters by Claude Code.
