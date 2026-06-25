# ORDO code-context — give the model the codebase as structure, not a pile of files

The one layer ORDO has no native source for: a project's **structure** (symbols, call graph, impact radius).
Grepping and reading files one-by-one burns tokens and still misses cross-file relations. A code graph turns
"read 40 files to understand this" into "query the structure, open only the 2 files that matter." ORDO does
**not** vendor an AST engine — it defines the *contract* a code-graph provider must satisfy and recommends an
external one. This keeps ORDO a spec + thin runtime.

## Provider (external, optional)
- **Default: [codegraph](https://github.com/colbymchenry/codegraph)** — local CLI + MCP, tree-sitter over 20+
  languages into a SQLite symbol graph, `codegraph_explore` returns relevant **verbatim** source + call paths +
  impact radius in one call, file-watcher keeps it fresh. Lossless retrieval (re-reads on-disk source); no LLM
  in the loop. Best fit for ORDO's lossless-first stance.
- **Multimodal option: [graphify](https://github.com/safishamsi/graphify)** — when docs/PDFs/images matter; a
  `/graphify` slash-command building a queryable graph across code + prose. Heavier (an LLM inference pass over
  prose), so gate its INFERRED edges (below).

ORDO's runtime can expose an optional `context_provider` hook field that shells out to whichever is installed;
absent a provider, the context layer falls back to ordinary reads.

## The contract (what any provider must honor — and what ORDO codifies natively)
1. **Deterministic-AST-first / LLM-only-for-prose.** Code structure is parsed for free (tree-sitter); it must
   **never** be sent to an LLM to "understand." Reserve LLM tokens for prose/images where structure can't be
   parsed. The lean-correct division: free structure, paid prose.
2. **Token-budgeted subgraph render with a hard cut + a self-describing truncation hint.** A query returns a
   subgraph rendered to a token budget (default ~2000); on overflow it HARD-CUTS and tells the caller how to
   narrow ("filter by X / open the file / `get_node`"). This is the output contract applied to graph traversal:
   seed-match the query terms, expand by relevance, stop at the budget. Order seed nodes first, then by degree.
3. **Confidence-tagged edges.** Every edge carries a tier: **EXTRACTED** (1.0, found verbatim in source),
   **INFERRED** (an LLM/heuristic guess, scored), **AMBIGUOUS** (flagged for review). An INFERRED edge is a
   hypothesis — it routes through the **evaluation gate** and is **never presented as fact**. Trusting inferred
   structure uncritically injects false relationships; this tag is the debias.
4. **Verbatim spine, skeletonized siblings** (from codegraph): render the *spine* files full and on-disk
   (lossless); collapse off-spine members of a polymorphic family to signatures (`fn foo(x): T { … }`), reversible
   via a follow-up `explore`. Annotate dynamic-dispatch hops with the **registration site** so a virtual call is
   traceable, not a dead end.
5. **Lossless-on-demand for big outputs** (the rtk failure-tee pattern): when a tool/build/test output is huge,
   keep a summary in context but stash the full payload at a disk path and **print the path inline** — the agent
   recovers the raw bytes only if it needs them. Compression with a lossless escape hatch.

## Honesty / the quality risk (must be stated)
A code graph is a **lossy navigation index, not the source.** It carries labels, relations, locations,
communities — not the actual logic. It is a **win for navigation/architecture** questions and a **trap if it
suppresses real file reads** for editing or debugging: for those, the agent MUST open the file for exact bytes.
A graph-first hook that over-suppresses `Read` makes editing WORSE, not better. So the rule the context layer
enforces: **graph for wayfinding, file for the bytes that get changed.** INFERRED edges are gated; the hard
budget cut silently drops low-degree nodes (mitigated by the truncation hint, but a recall ceiling — widen the
query if a needed symbol is missing).
