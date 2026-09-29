# Skill evals

Replaying real moments from the athlete's history through the coaching skills and scoring what they did. Covers this folder and `src/cassette.ts`; the guide is `docs/evals.md`.

One context of this repo's domain language; see the [context map](../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Scenario**:
A real moment in the athlete's history, frozen for a skill eval: a prompt, a scenario date that stands in for "today", the personal files as they stood then, a **Cassette**, and the graders a good run must pass. Stored privately as a case directory (`docs/personal/evals/scenarios/<skill>/<id>/case.yaml`); "case" is the same thing in flags and file names.
_Avoid_: "test" or "fixture" (a Scenario is judged, not asserted); inventing a Scenario that never happened.

**Cassette**:
A Scenario's recorded Intervals.icu GET responses, one file per request, replayed by `bin/icu` so a run never reaches the network. Writes are never recorded or sent — they are captured to the run's `writes.jsonl` and answered with a synthetic success.
_Avoid_: "snapshot" or "mock" — the cassette is real platform responses, not hand-made ones.

**Trial**:
One agent run of one Scenario at one model × effort. Trials repeat because the agent is not deterministic.

**Cell**:
Every **Trial** of one Scenario at one model × effort (and **Arm**). The unit results are reported and compared in: mean score, pass rate, and **pass^k** — whether every Trial passed.

**Arm**:
Whether a Trial runs with the skills (`skills`) or without them (`no-skills`, the baseline: `.claude/skills` and `.claude/agents` removed). A Scenario that scores as well without the skills points at a skill the model no longer needs.
