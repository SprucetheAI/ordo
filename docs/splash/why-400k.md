The model can hold a million tokens, and ORDO sweeps the window at 400 thousand. That sounds like leaving more than half the model unused. It is the other way round: 1M is how much it can hold, and you pay for what it holds on every single turn.

## The desk

Think of the context window as a desk. A 1M-token model has a very big desk. But before every step, Claude re-reads everything on that desk, and most of what piles up there is old tool output it will never need again. A fuller desk does not make it smarter. It makes each step a longer re-read, and it buries what you said under what a command printed two hours ago.

So ORDO works at 400k. When the desk is about 40% covered it gets swept, and the two things that matter go straight back on it: the anchor (goal, plan, decisions, what failed) and your own words. You keep the big desk. You stop re-reading the pile.

```chart
{"type":"line","title":"What Claude re-reads before each step, same 24 turns of work","unit":"k tokens","caption":"Illustration: same inflow per turn on both lines. Grey is never swept; orange is swept at 367k and restarts from the base plus the anchor.","labels":["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21","22","23","24"],"series":[{"name":"Let the window fill","values":[147,170,193,216,239,262,285,308,331,354,377,400,423,446,469,492,515,538,561,584,607,630,653,676]},{"name":"Swept at 400k","values":[147,170,193,216,239,262,285,308,331,354,130,153,176,199,222,245,268,291,314,337,360,130,153,176]}]}
```

The space between the two lines is the saving. On my own 1,510 sessions, replayed with the 400k setting, it came to 48% fewer context tokens (133 billion down to 69 billion). That number is modeled on real sessions, not read off this picture.

## Then why not 200k

Because a session is not empty when it starts.

```diagram
{"type":"steps","title":"Where 400k comes from","caption":"Measured on my machine on Nov 9, 2026. Your base will differ; the shape will not.","items":[{"label":"124k is already there","note":"Before the first tool call: system prompt, tool lists, CLAUDE.md, the skill list"},{"label":"About 240k of room","note":"Enough for one phase of real work: read, edit, test, verify"},{"label":"Swept at 367k","note":"Claude Code compacts about 33k under the window you set"}]}
```

Set the window much lower and the room shrinks faster than the cost does, so the session spends its time sweeping. Set it much higher and every turn re-reads stale output. 400k is where one phase of work fits between two sweeps.

## Four questions people ask

| Question | Answer |
| --- | --- |
| Is 400k too small for a 1M model? | No. 1M is what it can hold. You pay, in tokens and in attention, for what it does hold, on every turn |
| When is a bigger window right? | When one thing has to be held whole: a very large single file or log, or one chain of reasoning that cannot be split into phases. Raise it for that session, then go back |
| What if I do not run ORDO's hooks? | Then a sweep costs you your own words (8 in 100 survive word for word), and a bigger window is the safer default. The restore is what makes sweeping early cheap |
| Is the cap the whole strategy? | No, it is the backstop. What keeps paying is a smaller base, less going in (read narrow, let a subagent do the big reading), and sweeps that land when a phase has just finished |

## What changed in ORDO v0.4

```diagram
{"type":"steps","title":"One pass to size the task, then the smallest process that fits","items":[{"label":"Trivial","note":"A lookup or a one-line answer. ORDO does nothing"},{"label":"Nimble","note":"One defect, one file. Read narrow, fix, run the one check"},{"label":"Long","note":"Many steps. The anchor is written before the first edit"},{"label":"Massive","note":"A plan with phases. The plan is a file, one phase per fresh context"}]}
```

- The nudges follow your window: 40%, 65% and 85% of it. The last one says to finish the unit in hand, update the anchor and start no new large read.
- A long anchor now comes back head and tail, so the next step, the decisions and the failed approaches survive a long list of finished work.
- One line when a single tool result is about 15 thousand tokens or more, because it will be re-read on every later turn.
- Checks go to the cheapest place that can fail: a headless test for logic, a real browser for anything a person looks at, a headed window for motion and video.
- ORDO removes waste, never thought. It does not shorten reasoning on a hard problem, a deliverable you asked for, or a creative search.

The full version, with the picture and the scripts, is in the [ORDO README](https://github.com/SprucetheAI/ordo#1m-is-the-size-of-the-desk-not-the-plan). The setting itself is one line, `CLAUDE_CODE_AUTO_COMPACT_WINDOW`, documented in the [Claude Code environment variables](https://code.claude.com/docs/en/env-vars).
