# ORDO benchmarks

Every number here is reproducible. **COMPUTED** = a deterministic script re-derives it cold (run the
command). **AGENT-JUDGED** = a blind multi-agent test produced it (recorded in `docs/BUILD-LOG.md`, not
re-run by a script). All token costs are GPT `tiktoken` proxies (cl100k + o200k); re-validate on your
target model.

## COMPUTED (run these yourself)
| metric | result | reproduce |
|---|---|---|
| grammar token cut (20 real prompts) | English 437 → ORDO 285 = **34.8%** (o200k) | `python tools/freqmatrix.py` + the 20-prompt files in `tests/` |
| directive glyphs are 1 token | all 28 = 1/1; **runes = 3/3** (rejected) | `python tools/tokcost.py` |
| 1-token glyph pool | 511 in both tokenizers / 1674 total | `python tools/glyphpool.py` |
| output format: uniform array | **TSV −59%**, TOON −44% vs minified JSON; YAML/pretty-JSON are traps | `python tools/formatbench.py` |
| inbound (lossless built-in) | JSON→TSV ~72%, prose-whitespace ~33% | `python tools/pillars.py` (P1 gate) |
| ponytail filler-cut | ~67-77% on a chatty answer (lossless) | `python tools/pillars.py` (P2 gate) |
| full-pipeline blend (modeled) | ~47% realistic turn, ~88% log-heavy, ~13% prose-heavy | `python tools/pipeline_recalc.py` |
| runtime + classifier + installer + harness stats | the test suite (`npm test`) | `npm test` ; `python harness/test_ordo.py` |
| bundled-tool output compaction (Full tier) | crawl −62%, transcript −46%, PDF −24% (lossless) | `python tools/mcp_compact_ab.py` |
| classifyTask misroute (deterministic) | 5-trigger taxonomy complete; extraction is the open number | `python tools/route_truth.py` |

## Continuity (v0.3) — COMPUTED
527 real compactions, scored on recall of the user's words. Baseline is the default summary; ORDO is the same compaction with `hooks/ordo-continuity.mjs`. Cost is about 2.3k tokens per compaction.
| metric | baseline | ORDO | reproduce |
|---|---|---|---|
| keyword recall of the user's requests | 0.465 | **0.703** | `python -I tools/continuity_scan.py --since 2026-10-01` then `node tools/continuity_replay.mjs` |
| verbatim recall | 0.080 | **0.542** | same |
| constraint sentences kept | 0.374 | **0.584** | same |
| added cost per compaction | 0 | ~2.3k tokens | same |

## AGENT-JUDGED (blind multi-agent, recorded in BUILD-LOG)
| metric | result |
|---|---|
| skillstone decode fidelity (read spec cold) | 1.75 / 2 |
| deanchor: readable vs glyph decode | readable **2.00/2** @ −32% vs glyph 1.95/2 @ −35% |
| output quality vs plain English (9 tasks) | ORDO **6 wins / 2 ties / 1 loss** |
| REFEED loop (5 hard tasks) | first-pass flaws **4 → 0**, at 3.3× tokens |
| experimentalist gate (4 hard forks) | synthesis beat conventional **3 / 4** |
| do-it-good directives (5 tasks) | **−42%** first-pass flaws |
| context rot (literature, not ours) | 200K model degrades at ~50K; NoLiMa −58pp @ 32K |

## What is NOT benchmarked (honest gaps)
- **Wall-clock speed:** no real timing — only an output-token proxy.
- **Non-GPT tokenizers:** Claude/Gemini unmeasured; the headline % could shift on the model you use.
- **P10 context-integrity, P3 speed:** need harnesses (long-context degradation; real latency timing).
