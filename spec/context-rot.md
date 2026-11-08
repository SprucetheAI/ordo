# ORDO context-integrity gate — the complexity-adaptive anti-rot contract

> The gate that keeps a long run accurate, not just terminating. Performance degrades as input
> grows — non-uniformly, and **long before the window fills** (Chroma Context Rot: measurable drop at
> ~50K of a 200K window; LongMemEval ~30–60% gap focused-vs-full; NoLiMa: 10/12 models score
> half-or-less of base at 32K). The autonomy gate proves a run *ends*; this gate keeps the run *correct
> over its length*. It composes AFTER REFEED + experimentalist + autonomy, and it is **adaptive on
> purpose**: compaction itself loses "subtle but critical context whose importance only becomes
> apparent later," so it is pure tax on a short task and only earns its keep on a long one.

## Enforced by code (v0.3)
The prose rules below are no longer only advice. `hooks/ordo-continuity.mjs` enforces them, one hook dispatched on event (full account in `docs/CONTINUITY.md`):

| Rule in this spec | Event | What the code does |
|---|---|---|
| Ledger written before the window drops it (§0, §2) | UserPromptSubmit | Logs every user prompt verbatim to `~/.ordo/sessions/<sid>/intent.jsonl` and points long tasks at `~/.ordo/sessions/<sid>/anchor.md` |
| Warn early, checkpoint before compaction (§2) | PostToolUse, UserPromptSubmit | Reads real context size from the transcript and nudges "update the anchor" once per band: 150k, 300k, 450k, 600k, 750k tokens |
| A summary must keep the load-bearing set (§3) | PreCompact | Prints instructions to the summarizer: keep requests with status, constraints verbatim, decisions, failures, identifiers |
| Rehydrate, do not trust the summary (§4) | SessionStart (compact) | Re-injects the anchor, the user's requests verbatim (under 9.5k characters, constraint sentences first) and git state |
| Audit the loss | PostCompact | Logs recall of the user's words into `~/.ordo/compactions.tsv` |
| Sub-agent isolation (§2) | SubagentStart | Injects a return contract (answer first, 300 words or fewer, TSV rows, path:line, long output to a file) plus the parent's GOAL line |

The old 70/85/90 % thresholds were fractions of an assumed 200K window. The code uses the absolute bands above instead, so the nudges fire at the same token counts whatever the window size. Where this spec says 70/85/90 %, read it as the 150k/300k/450k/600k/750k bands.

Measured on 527 real compactions (`tools/continuity_scan.py`, `tools/continuity_replay.mjs`): keyword recall of the user's requests 0.465 to 0.703, verbatim recall 0.080 to 0.542, constraint sentences 0.374 to 0.584, at about 2.3k tokens per compaction. See BENCHMARKS.md.

## 0 · One law

> **Nothing load-bearing lives only in the window.** The window is a scratchpad that rots; the LEDGER
> is the source of truth. On the LEDGER track, every fact whose loss would cause a wrong next action is
> written to the ledger BEFORE the compaction event that would drop it — so the post-compaction agent
> rehydrates fidelity by *reading the file*, never by *trusting summary recall*. This is the structural
> difference from naive context-stuffing (let it grow, hope) and from blind truncation (drop whatever
> scrolled off, including the fact that became load-bearing later).

Two philosophies, and we run both by classifier: **prevention** (bound the context structurally — the
LEDGER track) vs **cure** (let it grow, compress on demand — the STANDARD track's fallback). A short
task gets cure-only-if-it-runs-long; a heavy task gets prevention from tick 0.

---

## 1 · The complexity classifier — which track (scored at intake, RE-checked every tick)

Route to the **LEDGER+compaction track** if **ANY** trigger fires; otherwise **STANDARD track** (normal
protocol, no ledger file, no compaction machinery). Re-score each tick because a STANDARD task that runs
long crosses into LEDGER territory mid-flight (the band trigger catches it).

| Trigger | LEDGER track if… | Why (grounded) |
|---|---|---|
| **Horizon** | >~15–20 tool calls expected, OR multi-phase | tool outputs are 70–80% of budget; they accumulate past the rot threshold fast |
| **Breadth** | >5 files OR >1 repo/lane | already the fan-out gate; breadth = distractor density = Context-Rot's measured compounding driver |
| **Load-bearing facts** | IDs, contracts, schema/migration state, decisions, ledger lane IDs that must survive a long horizon | these are exactly what truncation silently drops and what only becomes load-bearing later |
| **Irreversibility** | money / sends / migrations where a dropped fact → wrong action | the cost of a bad summary is unbounded here; a forgotten constraint fires a real side effect |
| **Projected fill** | total tokens projected >~50% of window | conservative-by-design (not a measured optimum); rot is observable from the ~25–40% fill band |

**STANDARD track** (Q&A, single-file edit, lookup, short refactor): normal protocol, **no ledger, no
compaction overhead.** It carries exactly one fallback — if it unexpectedly runs long and trips the
projected-fill or horizon trigger mid-run, it is **promoted** to the LEDGER track at that tick (write the
anchor + green criteria to a fresh ledger first, then proceed). Promotion is one-way within a run.

Do NOT put a single-fact task on the LEDGER track. Compaction loses subtle context and the ledger is
write-overhead; on a short task that is all cost, no payoff.

---

## 2 · The compaction policy (LEDGER track only) — staged band + degradation signal

Two independent triggers. **Either** fires compaction. The band is **harness-tunable, not a universal
constant** (public Claude Code references cite 70/85/90 and historically 83.5/95 — version-dependent;
the *principle* is stable: compact BEFORE the model is starved, with warnings that externalize first).

**(a) Token band — high-water-mark, not a single cliff** (against the working budget, ~200K for Opus/Sonnet-4-class):
- **~70% WARN** → pre-write the ledger to current state; offload any pending heavy read to a sub-agent so it never enters the main window.
- **~85% FLUSH + CHECKPOINT** → run the DROP pre-pass (§3); force a ledger checkpoint so the record is never behind live state.
- **~90% HARD-COMPACT** → summarize older history into a fresh window per the KEEP/DROP rules; carry the ledger pointer forward; **rehydrate (§4) before resuming.**

The 95%-style auto-trigger fires *too late to even have room to summarize* — that is why the band warns at
70 and checkpoints at 85, never waiting for the cliff.

**(b) Degradation signal — compact on rot RISK even under the token threshold.** Performance falls before
the window is full, so token count alone is the wrong sole trigger. Treat as a degradation event and
compact when the live context is large AND any of:
- **Distractor density** — dense with near-duplicate / competing tool outputs (1 distractor measurably
  hurts; 4 compound — Chroma). Compaction here removes *distractors, not signal*, because the
  load-bearing facts already live in the low-distractor ledger.
- **Self-contradiction / re-derivation** — the agent re-reads a file it already read, re-derives a known
  fact, or contradicts an earlier recorded decision. That is rot surfacing behaviorally.
- **Middle-bloat** — load-bearing content has been pushed into the under-attended middle (lost-in-the-
  middle U-curve: ~20+pp swing from position alone). Compaction re-seats the anchor + green criteria at
  the high-attention head, the live working set at the tail.

**How compaction runs (the pass order):** re-summarize older history into the ledger (the durable record),
DROP per §3 priority, then KEEP per §3 at the edges. The ledger is what makes this *safe to be lossy*:
the summary is a recall aid, not ground truth — §4's gate run is the only non-lossy verification.

**Prevention beats cure — defer the trigger.** Before compacting the main thread, offload bounded
research/exploration to **sub-agents** (existing fan-out: >5 files → 5–8 per agent). Each burns its own
window and returns a ~1,000–2,000-token distilled summary; the heavy trace never enters the orchestrator
window. This keeps the main context low-distractor (directly fights the Context-Rot distractor effect) and
pushes the compaction trigger out. The main thread keeps the ledger; sub-agents keep nothing durable.

---

## 3 · KEEP / DROP rules — the keep-set is exactly "loss → wrong next action"

**KEEP (carried into the fresh window, placed at the HIGH-ATTENTION EDGES — head and tail, never the
middle):**
1. **The immutable ANCHOR** — original task + clarifications, the definition-of-done (content-hashed, the §0-of-autonomy goal anchor). Placed at the head every tick; the U-curve's primacy slot is reserved for the objective so it can never rot into drift.
2. **The decidable GREEN CRITERIA** — the acceptance set + which are frozen-green. This *is* progress; steps logged are not.
3. **Load-bearing facts** — key decisions + rationale, open bugs / blockers + how prior ones resolved, IDs / contracts / paths / lane IDs, files modified + current state.
4. **The recent working set at full fidelity** — the ~5 most-recently-accessed files verbatim + the recent message window (~20K tokens). Summarize everything *behind* this; keep the live edge sharp.

**DROP (in strict priority order — reclaim the biggest, safest first):**
1. **Tool-output pre-pass FIRST** — file contents + command/search outputs are 70–80% of the budget; summarize or evict them as a dedicated pass *before* touching any conversation prose. Largest single reclaim, lowest risk (the durable copy is on disk / behind a pointer).
2. **Resolved subtasks** — once a phase/item passes its check, collapse its detailed trace to a one-line outcome; the ledger holds the durable record.
3. **Stale older turns** beyond the recent-keep window.
4. **Superseded drafts + redundant/duplicate messages + intermediate reasoning** already captured as a decision.

The keep-set is the minimal set whose loss flips the next action wrong. Everything else is a recall aid the
ledger already holds — so dropping it is reversible (re-read the file / the pointer), and the §4 gate
catches anything the drop got wrong.

---

## 4 · Restore protocol — rehydrate, don't trust the summary

After ANY compaction (or a fresh session/strand on the same task), the agent does **NOT** treat the summary
as ground truth. It rehydrates, in order:
1. Read **git log** (what actually landed) + the **PROGRESS / TASK ledger** (recorded facts) + the **anchor / acceptance checklist** (the definition-of-done).
2. Re-read the **~5 recent files** live (working-set fidelity the summary can't carry).
3. **Run the test / acceptance gate** — the only non-lossy verification. It catches undocumented drift the notes missed and the known failure mode that "compaction doesn't always pass perfectly clear instructions to the next agent."

Ledger restores *recorded* facts; the live re-read restores *working-set* fidelity; the gate run validates
*both*. Only then resume. This is also why the LEDGER write-discipline is "update at every phase boundary
AND at the 70%/85% warnings, not only at compaction time" — so the record is never behind live state when a
crash or compaction hits.

---

## 5 · How it composes with what we already own (do NOT rebuild)

This gate is ~80% wiring of existing ORDO parts; the only genuinely new piece is the **adaptive classifier
+ the degradation-signal trigger.**

- **ADAPT / autonomy ledgers (`autonomy.md` §6)** — the LEDGER track **IS** the existing append-only GOAL-ANCHOR / TASK / PROGRESS / STUCK ledgers. We add no new ledger; we add the *write-discipline timing* (write at the 70/85 warnings) and the *rehydrate-after-compaction* step. The content-hashed anchor read-every-tick already kills goal drift across compaction — §3-KEEP rule 1 just re-seats it at the high-attention head.
- **Autonomy "state lives OUT of context" + "batch-the-tick"** — already the structural defense. This gate makes compaction *safe* precisely because that invariant already holds: re-read state only after a crash **or compaction** (compaction is now an explicit re-read trigger, which it already named).
- **Orchestration handoffs-as-pointers + single-writer** — the answer to "don't re-serialize a 10K payload through chat." Compaction's tool-output DROP pre-pass and the sub-agent offload are the same lever: keep payloads behind a `result_pointer`, carry the pointer not the bytes.
- **REFEED minimal-delta (`autonomy.md` §3 / `framework.md`)** — the same rule applied to history: refeed the delta, not the transcript. Compaction is the *coarse* version (whole-history → summary); REFEED is the *fine* version (failing-gate → minimal delta). Same discipline, two scales; do not double-compress.
- **Headroom inbound compression (`harness/inbound.py`, P1)** — the per-read lever beneath compaction. Headroom shrinks what a single read costs (lossless TSV when the model must ANALYZE; lossy sampling + CCR retrieval only when it needs SHAPE); compaction shrinks accumulated history. They stack across different token pools, never on the same content. The **don't-send-it / JIT** lever is the strongest: a dropped tool output becomes a 1-line index + retrieval handle, so DROP rule 1 is reversible by construction.
- **Relevance-gated inclusion + lost-in-the-middle ordering (`harness/inbound.py` + `spec/output.md`, our docs)** — the placement half of KEEP: order by relevance, lead with the answer-bearing content, trim the middle. This is the one compression that *improves* quality (removes the distractors the U-curve punishes). Already specified; this gate just invokes it at the compaction edge.
- **Pillars model (`pillars.md`)** — adds **P10** below, test-gated like the other nine; no number advances on opinion.

The net: STANDARD track runs the framework unchanged. LEDGER track is the existing autonomy spine + the
existing inbound/orchestration levers, sequenced by a classifier and tripped by a band + a rot signal.

---

## 6 · The pillar — P10 context-integrity (rot-resistance)

| # | pillar | metric | gate (how it's measured) | baseline | lever |
|---|---|---|---|---|---|
| **P10** | **Context integrity** (rot-resistance) | **accuracy retention ratio** = (acc on a long, rot-baited run with the gate) ÷ (acc on the same task short-context) — held across length, vs naive context-stuffing as the control | a length-scaled multi-needle + distractor task (NoLiMa-style low-similarity needle, ≥1 distractor, answer planted mid-context) run at the short baseline AND at the long/full length, **gate-on vs naive-stuff control**; PASS = retention stays ≥ a set floor (target ≥85% of short-context base, the NoLiMa effective-length bar) where the naive control collapses | **UNMEASURED** (build the harness) | LEDGER externalization + staged compaction + edge-placement + degradation-trigger + sub-agent isolation |

**Why this metric, not raw NIAH:** vanilla single-needle NIAH is near-saturated and *overstates* long-context ability (RULER, NoLiMa) — passing it proves nothing. P10's gate deliberately uses the *hard* setup that breaks models: low query-needle similarity (forces associative reasoning, not string-match), distractors present (the measured compounding driver), answer mid-context (the U-curve trap). The number that counts is **retention vs a naive-stuffing control on the same task** — does the gate hold accuracy where stuffing rots? Single-needle pass = inadmissible, same as "feels suboptimal" is inadmissible to the autonomy ladder.

**Family note for calibration:** Claude is the most conservative family (highest abstention, lowest hallucination — Opus 4 refused 2.89% on the repeated-words task vs GPT confidently-wrong). P10 should reward abstention-under-uncertainty exactly as the autonomy VERIFY step rewards `abstained` — a model that says "I dropped that, let me re-read the ledger" is passing, not failing.

---

## 7 · The stack, one glance (where this gate sits)

```
COMPLEXITY CLASSIFIER ............ scored at intake, re-scored every tick → STANDARD | LEDGER track
  STANDARD track ................. normal protocol, NO ledger/compaction (promote if it runs long)
  LEDGER track:
    └ ANCHOR (content-hashed, read every tick) ...... §0-autonomy, re-seated at high-attention HEAD
       └ append-only LEDGER (state OUT of context) .. autonomy §6, written at 70/85 warnings
          └ sub-agent isolation (prevention) ........ heavy reads never enter main window
             └ COMPACTION (cure): band 70/85/90 + degradation signal
                └ DROP pre-pass (tool-output 70–80% first) → KEEP at edges (anchor+green+recent)
                   └ REHYDRATE (git+ledger+re-read 5 files+RUN THE GATE) — never trust the summary
                      └ Headroom inbound + relevance-gate + JIT ... per-read lever beneath it all
```

Composes after REFEED + experimentalist + autonomy. P10 measures the whole stack's rot-resistance.

## Honest limits
WHAT COMPACTION CANNOT RECOVER: anything that was load-bearing but NEVER written to the ledger before the compaction event that dropped it is gone — irreversibly. Compaction is lossy by definition; the ledger only preserves what the agent had the foresight to externalize. The known failure mode is real: 'compaction doesn't always pass perfectly clear instructions to the next agent,' and a fact's importance often 'only becomes apparent later' — after it has already scrolled off. The rehydrate gate (re-read git+ledger+files, run the tests) is the ONLY non-lossy backstop, and it only catches drift that the test suite can detect; an undocumented decision with no failing test passes silently wrong.

COST OF A BAD SUMMARY: the summary is carried forward AS the agent's working memory. A summary that mis-states a decision, inverts a constraint, or quietly omits a blocker propagates that error into every subsequent tick with full confidence — and on the irreversibility trigger (money/sends/migrations) that confident-wrong summary can FIRE a real side effect before the gate catches it. This is why the approval queue (propose-never-execute) sits underneath: compaction can corrupt the plan, but it cannot directly fire an OUTBOUND action. The blast radius is capped by the write boundary, not by compaction being correct.

LOSSY RISK + AGGREGATE LOSS: the tool-output DROP pre-pass (the 70-80% reclaim) is lossy sampling — 'what do these lines look like?' survives, 'how many status-500 errors / max latency?' does NOT unless the model retrieves the original via the pointer. If the agent compacts away a tool output and then needs an AGGREGATE over it, it must re-fetch or it answers wrong. Same tension as Headroom's 92%: gist-preserving, aggregate-lossy.

THE CLASSIFIER IS A JUDGMENT CALL, NOT A PROOF: the ~50% projected-fill threshold and the band (70/85/90) are conservative DESIGN choices, not measured optima — tuned too tight, compaction guillotines a run that had headroom and pays the bad-summary tax needlessly; too loose, the model rots before the trigger fires. The degradation signal (re-reads, contradictions, distractor density) is heuristic — it can false-trigger on a legitimately repetitive task (real polling, intentional re-reads) and miss silent rot that produces confident-wrong output with no behavioral tell. There is no ground truth on the classifier's own accuracy short of the P10 harness, which is UNMEASURED until built.

DEEPEST LIMIT (shared with the whole stack): every gate that depends on the model writing a truthful typed verdict can be defeated by a confidently-wrong model reporting 'pass' on a red criterion or 'I have it' on a fact it actually dropped. That is precisely why P10's gate uses an EXECUTABLE retention test (G-exec), not the model's self-report, and why rehydrate ends in a real test run — where no executable oracle exists, rot-resistance degrades to 'the summary looked complete,' which is exactly the failure mode the studies measured. Until the P10 harness exists, the rot-resistance guarantee is aspirational, not proven.
