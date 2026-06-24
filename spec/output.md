# ORDO output layer — the framework (format + verbosity)

The input grammar (`grammar.md`) cuts the *prompt* ~35%. This layer cuts the *output*, and output is
where the budget actually is: it dominates the bill and most of it is recoverable filler. Three knobs,
all measured.

## Part 1 — FORMAT (the structure of the answer)

Is JSON best? No — it is **shape-dependent**, and the default everyone uses (pretty-printed JSON) is
the worst choice in every case. Measured with `tools/formatbench.py` (o200k, vs minified JSON):

| data shape | best format | vs json_min | note |
|---|---|---|---|
| uniform array of objects | **TSV** | **−59%** | TOON −44%, md_table −28%; keys declared once |
| numeric table | **TSV** | **−51%** | TOON −39% |
| string list | **TOON** | −8% | barely beats json_min; TSV n/a |
| nested / heterogeneous | **json_min** | baseline | TOON +22%, YAML +31% are WORSE here |

**The rules:**
1. **Never pretty-print JSON.** Minifying alone saves 47-66%. The single easiest universal win.
2. **Tabular / uniform array → TSV** (best). Use **TOON** instead when you need length-validation
   (`[N]{fields}:` lets the reader check the row count) or light nesting; TOON also edges out on pure
   string lists.
3. **Nested / heterogeneous → minified JSON.** The "compressed" formats lose here — their per-block
   overhead beats their key-saving when there are no repeated keys to save.
4. **YAML is a token trap** for machine I/O (−31% to −42% vs minified JSON) despite its readable rep.
   Use it only when a human must hand-edit.
5. **Read accuracy — MEASURED, no harm.** Same dataset in JSON/TSV/TOON, 2 readers each, 8 factual
   questions: **all three scored 100% (16/16)**, TSV and TOON matched JSON exactly — including the
   multi-row sum and the strict-inequality boundary (the cases most likely to break under compression).
   So the saving is real, not a false economy. Caveat: small single-table test; re-validate on large /
   multi-table / ambiguous-header data before trusting blindly.

**Grammar integration:** the `grammar.md` format glyphs resolve to the measured winners — `表` (table)
→ **TSV**, `构` (JSON) → **minified** JSON (never pretty), `构` over a uniform array → **TOON** when row
count matters, `段` → prose. The directive picks the intent; this table picks the bytes.

## Part 2 — VERBOSITY (how much to say)

Two stacked disciplines, ordered by safety. This is the larger lever.

### Ponytail — always-on, lossless: do-less on output
The cheapest tokens are the ones never emitted. Cut, with zero information loss:
- **No preamble** ("Great question!", "Sure, here's…", "Certainly!").
- **No restating** the question or the task back to the user.
- **No closer** ("I hope this helps", "Let me know if…", "Feel free to ask").
- **No meta-narration** of what you're about to do; just do it.
- **Answer / code / result first.** Then at most a few lines. Stop when done.
- **Fewest words that carry the information.** Boring over clever; deletion over addition.

Measured: a typical chatty answer **146 → 34 tokens (77% off)** with the code and the explanation fully
intact — only filler removed. **Apply this before anything else; it is the safest, biggest win.**

### Caveman — bounded: terse register on OPERATIONAL text only
Drop articles, copulas, and connective filler; use arrows and fragments. Apply to **operational /
internal** text: plans, status lines, structured reasoning, working notes, commit bodies, agent-to-agent.

**NEVER caveman:** explainers, tutorials, documentation, creative or user-facing prose, anything a
human reads to *learn or feel*. Compressing those degrades the product — that is the failure mode.

Measured: operational text **65 → 21 tokens (68% off)**. Levels: `lite` (light trim) · `full` (default,
~75%) · `ultra` (maximal). The register is terse; the *information* and technical accuracy are not.

## Part 3 — the compression algorithm (one decision the model runs)

```
on producing output:
  1. FORMAT  — is it structured data?
       uniform/tabular → TSV   (or TOON if row-count/nesting matters)
       nested/mixed    → minified JSON      (NEVER pretty-print)
       prose           → Part 2
  2. PONYTAIL — always: no preamble/restate/closer/meta; answer-first; fewest words. (lossless)
  3. CAVEMAN  — operational text only; never explainers/creative/user-facing.
  4. OVERRIDE — honor the ORDO directive's modifiers: ↑/全 (expand/exhaustive) suspend caveman;
       段 forces prose; 构/表 force the format; an epistemic glyph (信/源/?) adds its required marking.
```

## The measured stack (why output is the prize)
| layer | typical reduction | loss |
|---|---|---|
| input grammar (ORDO-G) | ~35% | none (decode-tested 1.70/2) |
| output format (tabular → TSV) | ~55% | none (if read-accuracy holds) |
| output ponytail (cut filler) | **~77%** | **none** (lossless) |
| output caveman (operational) | ~68% | none on operational; N/A on explainers |

Input is bounded by the prompt; output is unbounded and filler-heavy, so the verbosity layer is the
dominant real-world saving. ORDO's whole thesis in one line: **have a goal, emit only what serves it,
in the cheapest faithful form — and only convert to human-readable prose where a human will read it.**

## Honesty
Format savings are shape-dependent (the table is the rule, not "TSV always"); on nested data the
compact formats lose. Ponytail is genuinely lossless; caveman is bounded and over-applying it to
user-facing prose is the one way this layer hurts quality. Token count ≠ quality — the target is fewer
tokens at **equal** information and accuracy, never terser-and-worse. Costs are GPT-tokenizer measured;
re-validate per model. The read-accuracy of compact formats is empirically tested, not assumed.
