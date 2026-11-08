STATUS: evidence + fix, written for a video
STAMP: 2026-11-08 · every number below re-derived from local Claude Code logs by tools/continuity_scan.py

# Opus 5.5 after November 3: what changed, what the logs say, and the fix

**Short version.** On 1,510 of my own Claude Code sessions, billed thinking at `high` effort dropped about 10%
after November 3, inside normal day-to-day noise, with no step on the day. What does leak, before and after
November 3 alike, is the context window: the median request carries roughly 450 to 490 thousand tokens, and
when compaction finally fires, its summary keeps less than half of what you actually asked for. That part you
can fix today, and ORDO v0.3 does it with hooks.

## 1. The claims going around

| Source | Claim | What it measured |
|---|---|---|
| @shanemelaugh, chart 1 | Thinking "changed" Nov 3 ~18:00 UTC, same model id, same CLI | Wording of the VISIBLE thinking text: share starting with "I'm" 25% → 61% |
| @shanemelaugh, chart 2 | `high` plans less upfront: median thinking before first tool call 84 → 54 (−36%), crashes +47% | Same logs, observational |
| @shanemelaugh, chart 3 | One audio bug: `high` failed after 160 turns and $13, `xhigh` solved it in 5 turns for $0.85 | One case; he says so himself |
| @evrendom (opaline.so MCP) | Style shift is real, several details are wrong; maybe reasoning traces are hidden more to counter distillation | 130 sessions, 45,571 thinking blocks |
| @ClaudeDevs, Nov 4 | Background subagent status lines now written by Haiku 5.5 from short notes, ~99% cheaper per update | An official change to STATUS LINES |

Two things worth saying on camera. The first two charts read the visible thinking text, which is a display
layer: Claude Code logs a `thinkingDisplay` mode per turn, and a change in how thinking is summarized for display
changes those word counts without the model thinking any less. And the Haiku change is about the little status
line a background subagent shows you. It is not the compaction summary. The Claude Code docs say the compaction
request inherits the session's thinking configuration; which model writes it is not documented, so "Haiku is
summarizing your context" is a guess, not a finding.

## 2. What my own logs say

Claude Code writes the BILLED thinking tokens of every request into the transcript
(`usage.output_tokens_details.thinking_tokens`). That is the real count, not the visible text.
Opus 5.5, main thread, requests deduplicated, before = Oct 20 to Nov 2, after = Nov 4 to Nov 8:

| Effort | Period | Requests | Zero-thinking | Median thinking | Mean thinking | p90 |
|---|---|---|---|---|---|---|
| high | before | 9,859 | 35.4% | 78 | 224 | 535 |
| high | after | 2,295 | 38.4% | 67 | 202 | 503 |
| medium | before | 3,305 | 38.1% | 63 | 221 | 494 |
| medium | after | 1,065 | 42.3% | 45 | 189 | 477 |
| xhigh | before | 1,522 | 29.9% | 100 | 333 | 652 |

Daily mean thinking at `high` ran from 139 to 325 before November 3 and from 179 to 219 after it. A 10%
drop that sits inside that band is not a nerf you can see in billed tokens. `xhigh` thinks about 50% more
than `high` per request (333 vs 224 mean), which fits the one-bug anecdote without needing a change on
November 3. Not tested here: answer quality, crash rates, and anything about model weights.

Also from the logs: Claude Code went 2.1.309 → 2.1.317 on this machine on November 4, and the thinking display
mode was already `updates` from October 28. Nothing flipped locally on November 3.

## 3. The leak you can measure: the window

| Measure (since Oct 1) | Value |
|---|---|
| Context per request, typical day (median) | ~450k to 490k tokens |
| Compaction trigger, median (101 compactions) | 748k tokens |
| Summary length, median | 17.5k characters for ~750k tokens |
| Distinctive words of your requests kept by the summary (527 compactions) | 46.5% |
| Your requests kept verbatim (first 80 characters) | 8% |
| Your rule sentences ("never…", "always…", "must…") kept | 37.4% |
| Keyword recall, compactions before vs after Nov 3 (median, n=87 vs n=9) | 0.414 vs 0.437 (no sign of degradation; the after sample is small) |

That is the mechanism behind "it ignores my instructions" and "it forgot what we decided": after a compaction
the model works from a paraphrase that dropped more than half of what you said, and at 450k+ tokens of context
every instruction competes with everything else in the window. It was true in October too.

## 4. The fix: ORDO v0.3 continuity

Hooks, not a different model. One file, `hooks/ordo-continuity.mjs`:

1. Every prompt you type is saved verbatim to disk (no tokens spent).
2. On a long task the model is told to write an anchor file: goal in your words, plan, done with proof, next
   step, decisions, failed approaches.
3. As context crosses 150k / 300k / 450k / 600k / 750k it is nudged once to update the anchor.
4. Before compaction, the summarizer gets a contract: every request with done/open status, your constraints in
   your words, decisions, failures, exact paths and ids.
5. After compaction, the anchor and your own requests (constraints first) are put back, under the harness cap.
6. Every subagent gets a return contract (answer first, at most 300 words, long output to a file) and your goal.
7. Every compaction is audited into `~/.ordo/compactions.tsv`, so you can watch the number move.

Replayed on the same 527 real compactions:

| Kept after compaction | Summary alone | Summary + ORDO |
|---|---|---|
| Distinctive words of your requests | 46.5% | 70.3% |
| Requests verbatim | 8.0% | 54.2% |
| Rule sentences | 37.4% | 58.4% |
| Cost per compaction | | ~2,300 tokens |

Plus one setting: compact at 400k instead of letting the 1M window fill (`CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000`).
Modeled on the same sessions: 47.9% fewer context tokens processed, for 1,102 extra compactions, which the
restore now makes cheap to survive.

## 5. Video beats

1. Cold open: the three tweets on screen, "is Opus nerfed?"
2. "I didn't guess. I read 1,510 of my own sessions." Billed thinking table: −10%, inside the noise.
3. Pivot: "The thing that actually forgets is the window." 748k, 46%, 8%.
4. The fix in one diagram: prompt → disk → summarizer contract → restore. 2,300 tokens to keep 70%.
5. Run it on your own logs: `python tools/continuity_scan.py` then `node tools/continuity_replay.mjs`.

Title options: "Opus 5.5 didn't get dumber. It forgot what you said." · "I audited 1,510 Claude Code sessions after
the Nov 3 nerf" · "The real Opus 5.5 nerf is your context window".

Description draft: Was Opus 5.5 nerfed on November 3? I read the billed thinking tokens from 1,510 of my own
Claude Code sessions: about −10% at high effort, inside day-to-day noise. The real leak is context: requests run
at ~470k tokens, and a compaction summary keeps 46% of what you asked and 8% of it verbatim. ORDO v0.3 fixes that
with hooks: your words and a working anchor live on disk and come back after every compaction (46% → 70% kept, about
2,300 tokens per compaction), subagents get a return contract, and every compaction is audited.
github.com/SprucetheAI/ordo

## 6. Say these out loud (the caveats)

- My data is one heavy user on one machine, not a population. The tweets' data is not mine.
- Keyword recall is a proxy for "the model still knows what I asked", not a test of behavior. The live A/B in
  docs/CONTINUITY.md shows the hooks firing in a real session; at small scale both arms pass.
- I cannot see model weights. Nobody outside Anthropic can. Billed tokens and logs are what is checkable.
