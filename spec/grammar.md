# ORDO-G — the grammar (Phase 2)

The structure layer on top of the 28 directive glyphs (`lexicon.md`) and the phrase glyphs
(`compression-map.md`). This is the lever the matrix pointed at: vocabulary substitution buys ~1-5%
(measured, `master-map.md`), but collapsing a whole instruction's **structure** to a handful of glyphs
buys **55-78%** on real commands (measured below). It was designed by a 4-way divergent panel, selected
by adversarial judges on compression + zero-shot decodability + parse determinism, and every glyph
re-verified 1-token here.

## The one idea: determinatives
Borrowed from Egyptian hieroglyphs and Chinese radicals, a **determinative** is a silent type-tag that
says *what category the next thing is*. In ORDO-G every operand and modifier is introduced by a 1-glyph
**tag** that names its grammatical role. Because the tag carries the role, **word order is free and no
delimiter is needed** — the parser bins each glyph by its tag, not its position. Total positional
freedom and zero ambiguity, for one glyph per slot.

## The measured law that shapes everything
**Whitespace costs a token** (benchmark spaced = 15 tokens, unspaced = 11). So **ORDO-G is written
with NO spaces.** The determinative system is what makes that safe: each glyph self-identifies, so
adjacency is unambiguous without separators. Every glyph below is verified **1 token in both** cl100k
and o200k (`tools/tokcost.py`); cl100k traps (短 疑 译 瑞 凡 …) were measured and rejected.

## 1. Sentence shape — slots, but order-free
```
[†] DIRECTIVE(s)  OPERAND?  MODIFIER*  CONSTRAINT*  EPISTEMIC*
```
Every slot after the directive is introduced by its own tag, so this is the *canonical reading order*,
not a required one — emit slots in any order; the decoder bins them by tag. Directives come first by
convention (cheapest to parse). **Bare operand, no directive = "answer this"** — the commonest act
spends zero glyphs.

## 2. Operand & its type (the determinative set)
At most one operand tag per directive (a second one belongs to the next piped stage).

| tag | type | decodes to |
|---|---|---|
| 文 | text-following | "the following text/article/passage" |
| 码 | code-following | "the following code" |
| 话 | conversation | "the conversation so far" |
| 上 | above / prior | "the text above / your previous output" |
| 此 | this / selection | "this / the current selection" |
| 网 | URL | "the URL that follows" (runs to next tag) |
| @ | named file | "the file named …" (filename runs to next tag/end) |
| 源 | source / data | "the following data/source material" |

**Inline literal:** a run wrapped in `"…"` is a verbatim operand — `δ"OAuth"` = "define OAuth".
**Deixis** (pointing) is just the tags 上/此/话 — free, same one-glyph mechanism.

## 3. Modifiers — `TAG[+VALUE]`, floating in any order
**Length** (self-valued, bare): `↓` tl;dr · `简` concise · `全` exhaustive · `↑` expanded.
**Format** (self-tagging values, `式` is optional sugar): `列` bullets · `表` table · `图` diagram ·
`码` code-only · `段` prose · `构` JSON/structured · `标` markdown. (JSON is `构`, NOT `信` — `信` is
epistemic certainty in §5; the two must never share a glyph.)
**Quantity + UNIT:** a digit binds to the glyph on its **right**, which is a **unit**: `字` words ·
`行` sentences · `段` paragraphs · `页` pages · `节` sections · `分` minutes · `项` items · `列` bullets ·
`名` names · `步` steps. So `80字` = "~80 words", `3行` = "three sentences", `3列` = "three bullets",
`20分` = "20 minutes". A bare digit with **no** unit glyph caps total output items (`5±` = five
variations). Always attach the unit when the original says words/sentences/etc. — a unitless count is
read as "items".
**Focus/scope:** `心`+facet — `心金` financials · `心码` the code part · `心题` the key problem ·
`心"latency"` literal.
**Audience:** `业`+level — `业通` lay/non-expert · `业专` expert · `业民` broad public. ELI5 = `业通↓`.
**Tone:** `调`+value — `调正` formal · `调反` casual · `调友` friendly · `调软` gentle.
**Language** (for τ / output language): **ISO-639 two-letter code** (measured 1 token) — `EN SV DE FR
ES JP …`. `τ话SV` = "translate the conversation to Swedish".

## 4. Constraints
| form | decodes to |
|---|---|
| ¬X | do not include / exclude X |
| 加X | you must include X |
| 只X | only X, nothing else |
| ×X | remove X from the output |
| 据X | preserve X exactly / stay grounded in X |

X is a value glyph or a `"literal"`. Reserved values: `序` = preamble/intro (`¬序` = no preamble),
`码` = code, `名` = names. `只码` code-only · `加例` include examples · `据API` preserve the public API.

## 5. Epistemic (native — Design Law 4)
| glyph | demand |
|---|---|
| 信 | mark your certainty/confidence per claim |
| 源 | cite your sources |
| ? | flag speculation / what you're unsure of |
| 确 | only state what you can verify; say so if you can't |
| † (prefix) | verify/fact-check first, then proceed |

They float like modifiers and stack: `信源` = mark certainty AND cite sources.

## 6. Composition
- **`|` = THEN (sequential pipe).** `σ|τ话SV` = "summarize, then translate the result to Swedish."
  Each stage's output is the next stage's operand by default.
- **`>` = APPLY-TO (nest).** `★>β5名` = "rate the output of (brainstorm 5 names)." Right side runs
  first. `>` binds tighter than `|`; `( )` force grouping.
- A stage with its **own** operand tag overrides the inherited output.
- **Composite verb:** ≥2 directives before the first operand tag apply together — `σ※` = "summarize
  and extract key points."

## 7. The 28 directives (carried in unchanged)
σ summarize · ε explain · δ define · α analyze · χ critique · ρ rewrite · τ translate · π plan ·
λ code · γ generate · β brainstorm · μ compare · φ fix · ν refactor · ω conclude · → continue ·
↑ expand · ↓ shorten · ★ rate · ☆ example · ※ extract · § outline · ● list · ■ classify · × remove ·
¬ exclude · ± vary · † verify. (`↑ ↓ § ● ¬ × †` double in modifier/constraint roles; the collision
rule below keeps them unambiguous.)

## 7b. Decoder contract (read before expanding)
Empirically, decoders fail in three ways unless told otherwise — obey these:
- **Expand EVERY glyph.** Never silently drop a format/scale/unit glyph. `表` always becomes "as a
  table", `步` always "step by step", `构` always "as JSON".
- **`★` always renders its 1-to-10 scale** ("rate from 1 to 10 on …") — it is in `lexicon.md`, do not omit it.
- **`↓` shortens the WHOLE output.** To make individual *items* short (e.g. "short names"), the encoder
  uses a literal (`加"short"`), not `↓`.
- **A constraint `×X` removes X from the subject** being acted on (e.g. `×"duplication"` in a refactor
  = remove the duplication from the code), distinct from the directive `×` = delete.
- **`信` = mark certainty; `构` = JSON.** Never conflate.
- **`※` = extract VERBATIM** — pull the exact items found, do NOT summarize (that is `σ`). With a
  list/data operand, `构` yields a JSON **array** of those items.

**Encoder discipline (the other half of fidelity).** The grammar can express any nuance via a
`"literal"`; brevity is never worth dropping a *hard* constraint or a specific audience. If the
original says "for someone who knows programming but not ML", encode that as a literal
(`业"knows code, not ML"`) rather than collapsing it to bare `业通`. The measured ~35% reduction already
includes this discipline — it is the honest number, not the maximally-terse one.

## 8. Parse rules — single left-to-right scan, O(n), provably one output
1. **Classify each glyph** by lookup in fixed disjoint tables (directives / operand-tags /
   modifier-class-tags / modifier-values / constraint-tags / epistemic / structural `| > " @ ( ) ?` /
   digit). A glyph's role is intrinsic, never positional — this is what makes parsing trivial.
2. **Directive binding.** Read leading glyphs as directives until the first non-directive. ≥2 = a
   composite verb. A leading `†` gates on a fact-check (it does not compose as a verb).
3. **Operand.** The first operand-tag binds the operand. `网`/`@` are range tags: the URL/filename runs
   to the next recognized tag or end. One operand per directive; a second is legal only after `|`/`>`.
4. **Digit binding.** A digit binds to the glyph immediately right; if that is a directive/end, it caps
   total items. Multi-digit numbers are one binding.
5. **Value binding.** A class tag (式 心 业 调 据 加 只 ¬ ×) consumes the value glyph/digit/`"literal"`
   immediately right; if the next glyph is a tag/directive, the class tag stands with its default sense.
   Format/length values are self-tagging (legal bare).
6. **Collision rule (the determinism guarantee).** A glyph lives in at most one table. `码` is the
   single deliberate dual-use (operand CODE vs format code-only), disambiguated by position; force the
   format use as `式码` if both readings are open. No other glyph may be dual-role.
7. **Composition precedence.** `>` binds tighter than `|`; evaluate `>` right-to-left within a stage,
   run `|` stages left-to-right; `( )` force grouping.
8. **Float + dedupe.** Modifiers/constraints/epistemic appear in any order, binned by tag. Same class
   twice → last wins (deterministic).
9. **Unknown glyph → inline literal** appended to the current operand. The decoder never errors; it
   degrades losslessly to pass-through text.

## 9. Verified results (measured, not claimed)
Benchmark — *"Summarize the following article in three concise bullet points, focus on the financial
figures, write for a non-expert, and don't include any preamble."* (32 tok)
→ **`σ文3列简心金业通¬序`** = **11 tokens, 66% off**, 9 glyphs.

| English | ORDO-G | tokens | cut |
|---|---|---|---|
| translate the conversation to Swedish, formal tone | `τ话SV调正` | 13→5 | 62% |
| refactor @utils.py, preserve the public API, code only | `ν@utils.py据API只码` | 20→8 | 60% |
| analyze the above; mark certainty, cite sources, as a table | `α上信源表` | 21→5 | 76% |
| step-by-step plan, exhaustive, for an expert | `π全业专` | 18→4 | 78% |
| brainstorm five names, then rate each 1-10 | `β5名\|★` | 17→5 | 71% |

Full benchmark-set measurement (20 prompts) and the empirical zero-shot **decode** test live in
`docs/BUILD-LOG.md` / `tests/`.

## Provenance & honesty
Designed by a 4-way panel (positional / determinative / RPN / hybrid), scored by 3 adversarial judges;
the determinative design won on weighted compression + decodability + determinism. Every glyph and the
example encodings were re-measured here (two came out 1 token *cheaper* than the design claimed). Costs
are cl100k/o200k (GPT proxies); Claude's tokenizer is proprietary — re-validate per model.

**v2 (this spec) was forged by an empirical zero-shot decode test:** 3 fresh agents read the spec cold
and expanded 20 ORDO commands; a judge scored fidelity vs the hidden originals. v1 scored 1.63/2 mean,
12/20 fully faithful, and exposed real bugs — the worst being a `信` double-assignment (JSON *and*
certainty) that made all 3 decoders agree on the *wrong* meaning (the tell that high agreement ≠
correctness). v2 fixes them: `构` for JSON (collision gone), count-units (§3), and the decoder contract
(§7b) for dropped glyphs / `↓` overload / `×` ambiguity. The faithful core (verbs, 加/心/只/据/业,
literals) decoded cleanly across all 3 agents from the first try — that core *is* zero-shot legible.
