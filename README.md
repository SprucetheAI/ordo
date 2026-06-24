# ORDO

**An experimental, LLM-native command language.** ORDO collapses the verbose prompts people type
every day ("summarize the following in three bullet points", "refactor this and explain why") into
terse symbolic directives a frontier model reads zero-shot from a spec. One directive-glyph plus a
few typed slots replaces a sentence. It is built *for* a transformer, not retrofitted from human
speech.

Latin *ordo*: order, rank, arrangement. A language that puts intent in order.

> **Two standalone, complementary concepts.** ORDO (this repo) is the *language*. The *harness*
> (orchestration, auto-commanding, verbosity control, self-learning) is a separate piece that will
> *use* ORDO. This repo builds the language first; the harness comes after. They are designed to
> compose, but each stands alone.

## Why this can work (the entrypoint)
The premise is no longer speculative. Two independent results ground it:
- **Zero-shot acquisition** (elder_plinius, GLOSSOPETRAE, June 2026): given only a grammar *spec*,
  frontier models read, write, and translate a never-before-seen constructed language with no
  fine-tuning, and at full glyph-swap they execute alien code *better* than the English version
  (Opus +36pp zero-shot on hard programs) while human legibility drops to ~15%.
- **The redundancy is measured** (Microsoft LLMLingua, peer-reviewed): ~80-95% of natural-language
  tokens are recoverable redundancy to a model; compressing prompts 4x can *raise* accuracy.

ORDO turns those findings into a *usable, lossless* notation. See `docs/method.md` for the full
lineage (Lojban's unambiguous grammar, logographic determinatives, VOKU's epistemic marking, runes,
and the honest corrections).

## The four design laws (the anti-shortcut discipline)
1. **Every symbol is tokenizer-validated.** "One glyph = one token" is false for exotic glyphs (BPE
   shatters them). A symbol earns its place only by *measured* token cost vs the phrase it replaces.
   See `tools/tokcost.py` and the measured costs in `spec/lexicon.md`.
2. **The compression is the grammar, not the glyph.** One directive + terse typed slots collapses a
   whole request; the glyph is the writing system, the slot-grammar is the engine.
3. **Lossless-to-intent, always.** Every symbol has a precise meaning and an English expansion; a
   model loading the ORDO spec must reconstruct the original intent (round-trip gate). Unlike lossy
   prompt-compression, ORDO round-trips.
4. **Epistemic + brevity are native grammar.** A mandatory certainty/evidence slot (kills confident
   hallucination) and a brevity/format slot (terseness is structural, not a request).

## Status — built and measured (P0-P4 done)
The language is real. Every number below was measured, not promised (`docs/BUILD-LOG.md` logs what was
checked per phase):
- **Alphabet** (`spec/lexicon.md`): 28 directive glyphs, each 1 token; plus a 1,674-glyph measured pool.
- **Grammar** (`spec/grammar.md`, ORDO-G): determinative type-tags, no whitespace. Cuts 20 real prompts
  **~35%** (benchmark 32→11 tokens, 66%), both tokenizers. **Decode-tested 1.70/2** by 3 independent
  agents reading only the spec.
- **Output framework** (`spec/output.md`): format-by-shape (tabular→TSV ~55% off JSON; never
  pretty-print) + verbosity (ponytail cuts a chatty answer **77%, lossless**; caveman 68% on
  operational text). The biggest lever.
- **Skillstone** (`ORDO.md`): one ~1.9k-token file that teaches any LLM the whole stack in one paste.

No magic multiplier is claimed — a measured, lossless, grammar-driven reduction on the command +
output layers. Read `DISCLAIMERS.md` for the honest caveats (GPT-tokenizer proxies, private-use only).

## Layout
- `ORDO.md` — **the skillstone: paste this into any LLM to teach it ORDO.** Start here to use it.
- `DISCLAIMERS.md` — what ORDO is and is not; the honest caveats.
- `docs/method.md` — research lineage + design method. `docs/BUILD-LOG.md` — per-phase what/how/verified.
- `spec/` — the language: `lexicon.md` (alphabet), `grammar.md` (ORDO-G), `output.md` (the framework),
  `compression-map.md` + `master-map.*` (the vocabulary layer + its honest ~1-5% ceiling).
- `tests/` — the benchmark prompts + their ORDO encodings + verification corpora.
- `tools/` — the measurement tooling that keeps it honest: `tokcost`, `glyphpool`, `freqmatrix`,
  `allocate`, `formatbench`.

## Use
1. Paste `ORDO.md` into any frontier LLM (system prompt or first message). It now reads and writes ORDO.
2. Send terse commands: `σ文3列简` = "summarize the following in 3 concise bullets". The model expands
   and executes. Its output follows the format + verbosity rules automatically.
3. Token savings depend on the model's tokenizer (optimized on GPT proxies; re-validate on yours). The
   spec is paid once (cache it); the output-verbosity savings amortize it in a handful of responses.
