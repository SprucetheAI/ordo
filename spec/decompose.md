# ORDO decompose — a task-graph DATA CONTRACT (format, not a runtime)

A named ORDO gap: how to break a goal into a managed, dependency-aware plan an agent (or the AUTONOMY gate)
works through. ORDO already has the *execution* machinery (autonomy gate + loop-fingerprint kill-detector,
REFEED, the ledger) — what it lacked is the *shape* of the plan. This is that shape, lifted from
claude-task-master's battle-tested schema. **Format + one SOP only; not its executor, loop, or MCP server.**

## The task node
```json
{
  "id": 3,
  "title": "Parse the JSONL usage fields",
  "description": "what + why, one or two sentences",
  "deps": [1, 2],
  "priority": "high",
  "complexityScore": 6,
  "testStrategy": "feed a synthetic transcript; assert token sums + dedup",
  "status": "pending"
}
```
- **`deps` are lower-id-only.** A task may depend only on tasks with a SMALLER id. This makes the graph a
  **DAG by construction** — trivially topo-sortable, no cycle check needed.
- **`testStrategy` is required per node.** Naming the evidence at *decomposition* time forces test-gating before
  any code is written — the same discipline as ORDO's test-gated pillars. A node with no testStrategy is a smell.
- **`complexityScore` (1-10) GATES expansion depth** (below). `priority` ∈ {high, medium, low}. `status` ∈
  {pending, in-progress, done, blocked}.

## The three-stage contract: decompose → score → expand-by-score
1. **Decompose.** Turn the goal/PRD into N top-level task nodes as JSON (schema above). Validate the shape; reject
   any node violating the lower-id invariant.
2. **Score.** Feed the task array back and annotate each with `{complexityScore, recommendedSubtasks,
   expansionPrompt, reasoning}`. The clever move: the score pass **pre-writes the expansion prompt** for the next
   stage, so breakdown is staged, not one-shot.
3. **Expand-by-score.** `finalSubtaskCount = explicit arg ?? recommendedSubtasks ?? default`. Only expand nodes
   whose `complexityScore` clears a threshold; trivial nodes stay atomic. Reuse the stored `expansionPrompt`.

## Next-task selection (pure, deterministic, zero AI)
```
eligible(t) := t.status in {pending, in-progress} AND every d in t.deps has status == done
next := the eligible task, preferring an eligible SUBTASK of an in-progress parent, else top-level;
        sort key: priority(high=3,med=2,low=1) DESC, then fewest deps, then lowest id.
```
This is a pure function over the task array — the AUTONOMY gate consumes it as the plan it iterates, emitting
each node via `emit()` (TSV for the task table).

## Honesty / the trust boundary (take the format, NOT the trust model)
- The **lower-id-only** invariant is a simplification: it can mis-rank genuinely parallel or mutually-related
  work. Keep it for topo-simplicity, but the AUTONOMY gate's own anchor/kill logic stays on top.
- The next-task picker **returns null when nothing is dependency-eligible** — a deadlock that *looks like done*.
  The AUTONOMY gate must distinguish "no eligible task" (blocked → escalate) from "all done" (terminate).
- Decompose + score are **single-LLM-pass** and therefore hallucination-prone (a wrong dependency edge, an
  over/under-count). **Never feed an unverified decomposition into an execution loop** — route a high-stakes plan
  through REFEED first. The schema is lossless and additive; the trust comes from ORDO's gates, not from the tool
  that produced the JSON.
