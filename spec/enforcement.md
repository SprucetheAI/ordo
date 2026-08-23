# spec/enforcement.md — turning the gates from SOPs into something that actually fires

Every other gate in this repo is an SOP: a document the agent reads and applies. `AGENTS.md` says so
plainly, and it is the honest limitation of the whole design. An SOP an agent can silently skip is a
suggestion, and the skips that matter are not the slow ones. They are the ones that end in a
**confident wrong report**.

This spec covers the two skips that produce one, and deliberately nothing else.

## The two rules

**VACUOUS EVIDENCE.** A check that executed nothing still prints like a check that passed.
`pytest --collect-only` emits `collected 5399 items` and exits 0. A `--dry-run` emits a plan. A
misfiltered selection emits `0 passed`. Every one of those matches the result-shaped patterns a
verifier looks for, and every one of them proves nothing whatsoever.

The rule: gate-shaped output whose blob also carries a vacuity marker does not count as evidence.
Re-run so it executes, or say the run was vacuous and name what is still unproven.

**NARRATED WORK.** The turn announces the next action and then stops without taking it. No edit, no
write, no command. A human is then expected to reply "yes, go ahead" to a step the agent had already
decided was correct, which converts an autonomous agent into an expensive autocomplete.

The rule: forward-tense intent about the agent's own next action, with zero mutation-capable tool
calls in the turn, blocks. A question mark releases it, because asking one good question is the
correct move and must never be punished.

## The three laws that keep an enforcer alive

1. **Err toward allowing.** A false positive blocks legitimate work, and the user removes the hook,
   after which it enforces nothing forever. A false negative leaves you where you already were. The
   asymmetry is total, so every pattern is narrow, every veto is broad, and every failure path exits
   zero.
2. **Bind evidence to its conditions, not just its shape.** Grafted from
   [unlazy](https://github.com/Leonxlnx/unlazy) (MIT), whose approval records bind command, working
   directory, shell, timeout and platform together. A green line from the wrong directory is not a
   green line. Record the resolved cwd next to the result, always.
3. **Always release.** A session the enforcer cannot let finish is worse than no enforcer. It counts
   its own blocks per session and stands down after four. A wall the agent cannot clear stops being
   a wall.

## What is deliberately NOT enforced

An enforcer that fires on everything is noise, and noise gets uninstalled. Not enforced: whether the
`EXPECT` token actually measures what the gate's title claims (no checker can know that; it needs a
human), how many passes the work took, whether the decomposition was good, or output format. Those
stay SOPs, judged by a reader.

## Abandonment

A check that genuinely cannot run is **abandoned with a non-empty reason and surfaced in the
report**, never deleted. This is the cheapest rule here and the one most often skipped: a gate that
quietly vanished is indistinguishable, in the final report, from a gate that passed.

## Install

    npx ordo enforce            # print the hook, the target file, and the exact diff. Writes nothing.
    npx ordo enforce --install  # write .claude/hooks/ordo-enforce.mjs + merge settings.local.json

Print-by-default is not politeness. A hook is executable configuration: it runs a program on every
stop, so it gets read before it gets installed, the same way an inherited check does. The default
target is `.claude/settings.local.json`, project-local and gitignored, because the installed command
carries absolute paths that are neither portable nor anyone else's business.

Uninstall with `--uninstall`. State lives in `.ordo/ordo-enforce-state.json`; add `.ordo/` to the
project's ignore rules.
