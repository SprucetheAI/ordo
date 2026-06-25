# ORDO orchestration — ledger-based multi-agent delegation

How the framework scales past one context: fan work out to many agents, coordinate through an
append-only **ledger** (not chat handoffs), and keep it crash-safe, resumable, and git-clean. This is
the discipline the whole build was run under; it is now a first-class part of the framework so any long
job follows it.

## When to delegate (the fan-out gate)
Delegate to parallel agents / a workflow when:
- **Breadth:** more than ~5 independent files or a broad research sweep — 5-8 files or one task per agent,
  to keep the main context clean.
- **Confidence:** a decision needs independent perspectives or adversarial verification before you commit
  (the experimentalist diverge arm, the judge panels).
- **Scale:** the job is bigger than one context can hold (a migration, an audit, a corpus pass).
Do NOT delegate a single-fact lookup or a trivial mechanical edit — the orchestration tax isn't worth it.

## The ledger (the shared substrate, not chat)
State lives in append-only markdown ledgers, never in context, so a run survives compaction, a crash, or
an approval pause and resumes exactly where it stopped.
- **ANCHOR** (write-once, content-hashed): the goal + the decidable acceptance criteria. The loop reads it
  every tick and NEVER writes it. A change is human-gated (kills goal drift).
- **PROGRESS** (append-only): one row per tick — `ts | agent | action | tier | evidence | verdict |
  criteria_green_delta`. The green count only rises; a window that turns nothing green is a livelock
  signal (see `autonomy.md`).
- **TASK / LESSONS** (append-only): the work queue + the compounding lessons (process lessons apply NEXT
  run, domain facts update the live frontier).

## Single-writer + handoffs-as-pointers
- **One orchestrator owns the plan and the ledgers.** Workers return results or escalate; they never
  reframe the global plan. This is what keeps concurrent agents from corrupting shared state.
- **Handoffs are POINTERS, not payloads.** A worker writes its output to the store (a file, a result id)
  and signals `result_pointer=<id>`; the next stage reads what it needs. The durable substrate is the
  message bus — no re-serializing a 10k-token payload through chat. (The strand `stage_proposal` /
  store-and-signal pattern.)
- **All side effects go through the approval queue** — propose, never execute (write / send / deploy /
  delete). Reversible reads run free; irreversible actions wait for the gate.

## The execution patterns (pick by dependency)
- **Pipeline (DEFAULT):** run each item through all stages independently, no barrier — item A can be in
  stage 3 while item B is still in stage 1. Wall-clock = the slowest single chain, not sum-of-stages.
- **Barrier (parallel) ONLY when stage N needs ALL of stage N-1:** dedup/merge across the full set,
  early-exit on zero results, or a stage that references "the other findings." A barrier you don't need
  wastes the fast agents' idle time.
- **Adversarial verify:** spawn N independent skeptics per finding, prompted to REFUTE; kill on majority.
  Prevents plausible-but-wrong findings surviving. (Every measured claim in this repo was verified this way.)
- **Loop-until-dry / completeness critic:** for unknown-size discovery, keep spawning finders until K
  rounds return nothing new; a final critic asks "what's missing." Simple counters miss the tail.

## Git + file discipline
- **Commit per finished unit of work; push is the billable action, not the commit.** Commit locally
  freely; push only when (a) the user asks, (b) runnable code that CI tests changed and needs the gate,
  or (c) it's a real shareable checkpoint. Never auto-push loops/janitors/drafts. `[skip ci]` for any
  push CI can't meaningfully test (docs, vault, content).
- **Branch off the default branch** for non-trivial work; never commit straight to a shared hot tree
  that concurrent watchers may auto-commit under you (verify `git status` clean + your edits in the
  pushed HEAD before declaring green).
- **Ledgers + anchors live in the repo** (`tasks/adapt/`), content-hashed and append-only, so the run is
  auditable and replayable.

## Composition with the rest of the framework
The orchestrator runs the **autonomy** loop (GATE-PRE → act → verify → escalate → terminate) with its
kill conditions and budgets; each work item can be a **REFEED** loop; a hard fork item opens the
**experimentalist** gate; every result is scored by the **evaluation** gate before it's frozen green.
One writer, a durable ledger, honest gates — that is how the framework stays coherent across dozens of
agents and a long horizon.
