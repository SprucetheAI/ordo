# ORDO research synthesis — the beyond-tokens case (C1)

Distilled from all 20 xenolinguistics docs (GLOSSOPETRAE paper + engine, Lojban CLL, LLMLingua,
VOKU/AEP, SynthLang, the symbolic-compression landscape, and the five-source/blueprint syntheses) by a
6-reader digest → 63 mechanisms → ranked. The reframe this answers: **ORDO's value is not only token
density.** A genuinely LLM-native language can move accuracy, hallucination, and (maybe) speed. Below is
what the research actually supports, graded by confidence, with the ORDO application and the test that
will turn each from a claim into a number. Honesty is the point: most quality claims are leads, not laws.

## The load-bearing mechanisms (ranked)

1. **One-parse grammar (surface form *is* the logical form)** — *quality/accuracy, HIGH.* The most
   cross-attested finding (Lojban ×5 readers, GLOSSOPETRAE, logographic). A string with exactly one
   parse removes the model's need to disambiguate, and the variance disambiguation introduces. → ORDO-G
   already targets this; the **harness must enforce it with a real PEG parser** (malformed = caught,
   never silently misread). Test: ambiguous-in-English instructions vs their single ORDO rendering,
   measure output variance + error at temperature.

2. **Typed numbered-slot structure = function signature / KG triple** — *hallucination/quality, MED.*
   Lojban's `x1..x4` place structure is isomorphic to a tool call and a memory triple. A command whose
   arguments are typed slots is harder to under-specify or hallucinate around. → ORDO's determinative
   tags already do this; lean into it for tool/agent commands.

3. **Mandatory epistemic + evidence slot** — *hallucination, MED, with a trap.* VOKU/Lojban-evidentials
   converge: make certainty + source a *required* grammatical slot (ORDO's `信/源/?/确`). **The trap (C5
   must catch it): a model can stamp "cited" on a fabrication, inverting the signal.** So C5 measures the
   *tag-to-truth correlation*, not the presence of the tag.

4. **Tokenizer-validation guardrail** — *density, HIGH, MEASURED.* The best-measured finding and the
   easiest way to sink the project: exotic/CJK/rune glyphs often cost 2-3 tokens (runes = 3, measured).
   → already enforced (`tokcost.py`); keep it as the admission gate for every new glyph.

5. **Glitch-/undertrained-token avoidance** — *quality/hallucination, HIGH that the pathology exists.*
   In-vocab ≠ understood; undertrained tokens (SolidGoldMagikarp) trigger erratic output. → **Screen
   every ORDO glyph with an echo+define probe**; a glyph the model can't reliably echo/define is a
   latent decode bug (this likely explains some of our decode misses).

6. **Prior-stripping quality lift on HARD tasks (the +36pp lead)** — *quality, LOW.* GLOSSOPETRAE:
   glyph-swapped code beat readable code zero-shot on hard programs (+36pp Opus, +10pp GPT-5.5). The
   paper *measures the effect but not the mechanism* ("strips English priors" is a flagged hypothesis);
   concentrated on the hard tier and weaker/cheaper models. → **This is the crux for the deanchor
   question** (see tension below). Test: C2/C4, three surface forms, difficulty-stratified. Treat as a
   lead to reproduce, never as banked.

7. **Lossless round-trip-to-intent gate** — *quality, HIGH, binary-testable.* What separates ORDO from
   lossy LLMLingua. → bake a round-trip check into the harness CI: ORDO → English → re-encode must match.

8. **Reinvest the saved token budget into in-loop validation** — *quality/speed, MED.* The honest way
   ORDO claims quality, not just density: compressing the command frees budget to spend on a
   self-check/validation pass → fewer errors at equal total cost. → C4 stretch arm.

9. **Zero-shot acquisition + prompt-cache amortization** — *capability/density, HIGH, MEASURED in ORDO.*
   Frontier models operate ORDO from the spec with no fine-tune (our skillstone = 1.75/2); cache the
   spec once and every later message is denser. → ships as `ORDO.md`; amortization is the real economics.

10. **Intent-as-symbol (whole-intent macros)** — *density/quality, MED.* The single-WORD lever is dead
    (~1% useful, BPE pre-compressed common words). The live vocabulary lever is whole *intents*
    ("explain your reasoning step by step", "what are the trade-offs", "only the code"). → C7: mine,
    allocate 1-token macros, blind-decode-test at the ~1.7/2 bar.

11. **Distractor-removal / relevance-reorder (LongLLMLingua +17.1%@4x)** — *quality, HIGH but SCOPED.*
    Measured RAG accuracy *gain* from compression — but it is noise-stripping in long context, **not**
    transferable to ORDO's short command channel. Recorded so we don't over-claim it.

12. **Determinism / no-whitespace / composition laws** — *density/capability, MEASURED.* Already in
    ORDO-G; the harness formalizes the parse.

## The central tension (the experiment that matters most)
**Deanchor says readable; GLOSSOPETRAE says foreign.** Our decode errors clustered on cryptic glyphs →
readable-terse should decode more reliably. But the +36pp quality lift is specifically at *full
glyph-swap* (foreign), not abbreviated-English. These pull opposite ways. **C2/C4 resolve it
empirically:** three byte-identical-semantics surface forms — (a) plain English, (b) abbreviated-English
ORDO, (c) full-glyph ORDO — measured on tokens, decode fidelity, AND hard-task output quality. The
answer is whichever wins on the *combined* objective, not whichever is prettiest or densest.

## Honest caveats (what the corpus does NOT support)
- **No measured speed/cost win.** Fewer tokens ≠ 1:1 latency or cost; rarer tokens can cost more
  per-token compute; the sign is unknown until measured end-to-end. C6 reports an **output-token
  saving (a proxy)**, and any standalone speed claim is dropped if latency rises.
- **The +36pp is a lead, not a result** — single-source, n=30, non-peer-reviewed, mechanism unproven,
  hard-tasks/weak-models only. Reproduce before banking.
- **The single-word lever is dead** (~1%); don't rebuild a word-swap table. Macros (C7) are the lever.
- **Exotic glyphs are usually token-negative** — every new glyph must clear `tokcost.py`.

## The experiments (each → an acceptance criterion)
- **C2 X-DEANCHOR** — 3 surface forms × difficulty; metric = tokens/intent + decode fidelity/2; choose a
  direction on evidence.
- **C4 X-QUALITY** — blind A/B, N≥30, easy/med/HARD; English vs ORDO (+ stretch: ORDO+reinvested
  validation); judge scores output quality; PASS = ORDO ≥ English within noise.
- **C5 X-HALLUCINATION** — factual set + unanswerable subset; metric = confident-wrong rate, abstention,
  calibration, and the tag-to-truth correlation; PASS = lower confident-wrong and/or better calibration.
- **C6 X-SPEED** — output-token delta (proxy) + wall-clock + cost; PASS = output-token saving quantified.
- **C7 X-INTENT-MACRO** — mined macros, tokenizer-validated, blind-decode ≥ ~1.7/2.
- **C8 X-HARNESS** — `harness/` PEG parser + codec + round-trip CI, pytest green (the instrument for all above).
