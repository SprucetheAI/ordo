# AGENTS.md — how an AI agent uses ORDO

ORDO upgrades how you (an LLM) handle context, commands, output, and long runs. Load the spec, then
operate by it.

## Activate
Read `OPERATING-PROFILE.md` (or run `npx ordo profile`) and follow it as standing instructions. It is
~1.4k tokens; cache it once. It contains: the honest stance, the compression layers, the gate routing,
the pillars, and the orchestration discipline.

## The contract, in brief
1. **Honesty first.** Solve the real goal, not the prompt. Truth over the pleasing answer. 10 is not the
   target — a right-scoped 9 is optimal; over-engineering scores *down*. Never claim a number above its
   evidence tier.
2. **Compress losslessly, and only where it pays.** Commands in readable-ORDO grammar
   (`spec/grammar.md`); output by data shape (tabular → TSV, nested → minified JSON, never
   pretty-print; prose → ponytail, cut the filler); inbound docs via `compressInbound()`.
   **Never rewrite text already inside the cached prefix.** Cache reads cost a fraction of base
   input, so shrinking cached content invalidates it and everything after it and is usually a net
   LOSS. The token counter says you saved; the invoice says you spent. Pass `{cached:true,
   downstreamTokens}` and let `cacheEconomics()` decide.
3. **Classify, then gate.** Easy/deterministic → single pass. Hard, one answer → REFEED
   (`spec/framework.md`). Hard, real fork → experimentalist (`spec/experimentalist-gate.md`). Before
   "done" → evaluation gate (`spec/evaluation-gate.md`). Long autonomous run → autonomy gate
   (`spec/autonomy.md`). Long/complex context → context-rot gate (ledger + compact, `spec/context-rot.md`).
4. **Persist via a ledger,** not chat: single-writer, append-only, handoffs-as-pointers, the approval
   queue for side effects (`spec/orchestration.md`).

## The runtime you can call (Node)
```js
import { decode, emit, compressInbound, ponytailFlags, resolveModel, classifyTask, getSpec } from "ordo-llm";
decode("σ文3列简");        // ORDO command -> full English instruction
emit(data);                // cheapest faithful format
compressInbound(doc, {cached, downstreamTokens}); // lossless; measured-revert AND cache-aware
cacheEconomics({before, after, downstreamTokens}); // is shrinking cached text worth the reprice?
ponytailFlags(text);       // filler the output contract forbids
classifyTask(signals, {nativeEffort}); // {mode, engage[], effort, effortSource} (spec/thinking.md §1)
resolveModel(req, policy); // opt-in model routing (default-strong; null policy = never downgrade)
getSpec("framework");      // load a gate's SOP as text
```

**Think first (`spec/thinking.md`).** Before acting, classify the task on 5 hard signals (reversibility ·
real-fork · horizon · breadth · load-bearing facts). LIGHT → act direct, only diction + verify-assert fire.
HARD → STRICT: lead with a plan + ledger, pin an immutable end-goal and re-derive each step from {goal + actual
prior result}, reuse-before-build, single-pass divergence on wide forks, cause-first self-heal on a failed gate.
One pass; the multi-pass gates fire by exception. Spend effort proportional to the stakes.
Most gates are SOPs you apply, not code that runs; `getSpec()` returns them as instructions. TWO now
actually fire: `npx ordo enforce` installs hooks that block a turn reporting VACUOUS evidence (a check
that executed nothing) or NARRATING work it did not do, and classifies each prompt so the discipline
engages on STRICT tasks without being invoked. Print-by-default, self-releasing, opt-in
(`spec/enforcement.md`).

## CLI (for non-coders too)
- `npx ordo init` — install the `/ordo` skill into this project's `.claude/` (then Claude Code loads it
  automatically on coding/agentic tasks). Or `/plugin marketplace add SprucetheAI/ordo` → `/plugin install`.
- `npx ordo measure` — the **real** cost/token/duration meter: reads Anthropic's own `usage.*` from Claude
  Code's JSONL (lossless billed counts). Run it ORDO-on vs ORDO-off for the real A/B dollar delta.

## Two more layers
- **Code context** (`spec/code-context.md`): query a code-graph provider (codegraph/graphify) as a *navigation
  index*; open the file for exact bytes; never trust an INFERRED edge as fact.
- **Decompose** (`spec/decompose.md`): plan a multi-step job as a lower-id-only DAG with a per-node `testStrategy`;
  the autonomy gate iterates the pure next-task picker.

## Honest limits
GPT-tokenizer proxies (re-validate on your model); no proven wall-clock win; the glyph form is opt-in
(readable-ORDO is canonical and decodes more reliably). The cache rates in `cacheEconomics` are
PARAMETERS matching published multipliers at time of writing, not constants of nature: pass your own
once pricing moves. `classifyTask`'s RULE is deterministic, but the dispatch hook's reading of the
five signals off a raw prompt is a conservative heuristic tuned to UNDER-fire, and its accuracy is
unmeasured. See `docs/SELF-EVAL.md`.
