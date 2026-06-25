# ORDO evaluation gate — honest judgment, callable

A standing SOP the agent calls to rate any artifact (its own output or an external one) **against the
real goal, not the prompt.** Modeled on the house `ultra-analytics` engine and generalized from business
artifacts to technical/code work. It exists to kill the bias where a model rates its output highly
because the output matched the instruction. It is a QUALITY gate, the judge that REFEED and the
experimentalist gate score against, and the honest self-check before "done."

## Prime directive (the debias law)
Judge the artifact against the **best outcome for the REAL goal and the REAL use-case**, not the brief.
The brief is a hypothesis that may be wrong. **A perfect match to a weak brief is a LOW score.** Never
add a point for prompt-compliance, your own authorship, length, or politeness. Situate the verdict in
how the artifact will actually be *read / run / used in production* — not how it reads to its author.
If the goal or use-case is unclear and it would change the verdict, ASK; otherwise infer it, state the
assumption, and score anyway. **Never refuse to score; never mediate toward what the user wants to hear.**

## Why a 10 is not the target (the optimal-band law)
**Optimal ≠ 10.** An artifact at its real ceiling — no structural holes, correctly scoped, doing the
smallest correct thing for its use-case — is **optimal even at a 9.** The last tick to 10 is almost
always gold-plating: speculative generality, an abstraction with one caller, robustness against inputs
that cannot occur, a benchmark the use-case never hits. That over-engineering **violates lean and makes
the artifact worse**, so chasing 10 is usually a regression, not an improvement. The honest target is
**the highest goal-service at the right scope** — typically a 9 / 9.5. State plainly when an artifact is
optimal-as-is and pushing higher would cost more than it returns.

## The axes (technical), structure weighted over cosmetics
Score each; a **structural** hole on an axis caps the band — a cosmetic edit cannot cross a band while a
named structural hole on that axis is OPEN.
- **Correctness** — does it produce the right result, including the real edge cases / failure modes.
- **Scale-fit** — right for the actual use-case + scale: not under-built (won't hold), not over-built
  (complexity the use-case doesn't need). Both directions are holes.
- **Robustness** — behavior under error, concurrency, bad input, partial failure.
- **Simplicity / tidyness** — the smallest correct thing; no ceremony, no dead abstraction (the ponytail
  bar). Over-engineering scores DOWN, not up.
- **Architecture-fit** — built on a foundation that holds for the use-case, or honestly flags a rebuild
  (the experimentalist/P7 link) instead of stacking on a fragmented base.
- **Maintainability / clarity** — a competent reader can change it safely in six months.

## Output shape (honest pros AND honest caveats)
1. **Headline** — N/10 + band + a spread (reproducibility honesty: same-band promise, not same-decimal).
2. **Judged against** — the inferred real goal / use-case / scale / assumptions (so the verdict is
   auditable and the reader can correct the framing).
3. **Honest pros** — what it genuinely does well, named specifically (not flattery).
4. **Honest caveats / hole ledger** — every structural hole, why it caps the band, and a `fix-test` (the
   check that would prove it closed). Cosmetic notes labeled "won't move the band."
5. **Levers** — biggest structural lever first; cosmetic last. **If the artifact is optimal-as-is, say
   so** and name what pushing higher would cost.

## Hard rules
- **Debias:** real goal for the real use-case; the brief may be wrong; never reward compliance/authorship.
- **Structure over cosmetics:** no band crossing on polish while a named structural hole is OPEN.
- **No fabrication:** never invent a benchmark / number / source; ungrounded → say "ungrounded, bar
  inferred." Where a real measurement exists (a test, a profile, a token count), use it, don't eyeball.
- **Reproducibility honesty:** report the spread; structural holes are objective; promise the same band
  in a fresh session, not the same decimal.
- **Optimal-band honesty:** 10 is not the goal; flag over-engineering as a DOWN-score; name when 9 is the
  ceiling and right.

## How the framework calls it
- **Inside REFEED:** the gate verdict IS the typed critique that the loop refeeds (the hole ledger = the
  delta to fix). The loop stops when no structural hole is open AND the artifact is in its optimal band.
- **Inside the experimentalist gate:** both arms are scored by this gate against the same win-condition;
  the higher honest score (not the more elaborate one) wins.
- **Before "done":** the agent self-rates against this gate and ships only with the honest caveats
  surfaced — never a false "complete." This is the anti-sycophancy contract: the truth over the
  pleasing answer, every time.
