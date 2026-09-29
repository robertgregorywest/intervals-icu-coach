# Context Map

intervals-icu-coach is a server exposing Intervals.icu operations and agentic-coaching tools, plus the skills that coach with them. Its domain language is split into contexts, each glossary living beside the code it names. Read the one for the area you're working in; the relationships and ambiguities below are the terms that cross between them.

## Contexts

- [Tool surface](./src/CONTEXT.md): Tools, the Tool registry, the MCP and CLI adapters that project them, and **Services**, the composition root
- [Athlete anchors](./src/services/athlete-anchors/CONTEXT.md): FTP, MAP and the MAP and FTP zones, read in one place
- [Coaching](./.claude/skills/CONTEXT.md): the coaching-context stack, the Workout brief a coaching skill hands its build skill, and the review window
- [Workout library](./src/services/workout-library/CONTEXT.md): tracked Workout templates synced to Intervals.icu, and the one way a workout reaches the calendar
- [Prescription](./src/services/prescription/CONTEXT.md): workout text turned into resolved Planned steps, and which of them are Work steps
- [Execution review](./src/services/execution-review/CONTEXT.md): what was ridden, judged against the prescription by Verdicts and the Intensity distribution
- [Training load](./src/services/training-load/CONTEXT.md): week summaries, the Middle-band dose, and Forecasts of proposed sessions
- [Track](./src/services/track/CONTEXT.md): lap-split records placed against the recorded stream and written back
- [Skill evals](./evals/skills/CONTEXT.md): real moments replayed through the coaching skills and scored

## Relationships

- **Tool surface → every context**: each context reaches callers only as Tools, whose handlers reach the service modules through **Services**
- **Coaching → Workout library**: a **Workout brief** is the only hand-off from a coaching skill's decision to its build skill, which writes through the **Workout scheduling module**
- **Athlete anchors → Workout library, Prescription, Execution review, Training load**: **Sync** renders at the current anchors, and every other service takes FTP and MAP from **Athlete anchors**
- **Prescription → Execution review, Training load**: the **Planned steps** it resolves are what both review lenses and the **Forecast** consume
- **Skill evals → Coaching**: a **Scenario** replays the coaching skills against a **Cassette** served through the CLI adapter
- **Track** stands apart: it places a **Lap-split record** against the stream and never produces an **Execution record**
- **The prescription is the contract both lenses judge against.** Because workouts are authored in absolute watts, neither the **Verdict** nor the **Intensity distribution** moves when FTP or MAP moves between prescribing and riding
- One parse feeds three consumers, and they do not agree by accident: **Session load** and per-zone seconds take a prescribed range at its midpoint, while the **Middle-band dose** takes it by width-share. The midpoint-collapsed stream must never be used to read seconds in the middle band
- A `Z`-target in workout text resolves against the athlete's **FTP zones**, not the **MAP zones** the coaching layer otherwise reasons in — the **Forecast** mirrors the platform, and the platform anchors workout text on FTP
- A **Forecast** and the execution-review lenses answer opposite halves of the same question and **neither subsumes the other**: the Forecast says what a week would cost if ridden as written, the **Verdict** and **Intensity distribution** say what riding it actually delivered

## Flagged ambiguities

- "verdict" was used for two unrelated judgements — resolved: a **Verdict** judges delivery against prescription, an **Alignment verdict** judges how well a measurement was placed. They travel in different results and neither implies the other; a run can be ridden exactly to prescription and still align `weak`.
- "seed" has two senses — a **Seed** is where a **Forecast** starts; a _seed case_ (tag `seed`) is one of the first **Scenarios** built for a skill. Unrelated; say "seed case" in full for the latter.
- "projection" — a **Projection** is a Tool as exposed by one Adapter (Tool surface); it never names a training-load trajectory, which is a **Forecast** (Training load).

## ADRs by context

All decisions live in [`docs/adr/`](./docs/adr/), numbered globally.

- **Tool surface**: 0001 CLI adapter and tool registry · 0002 CLI JSON input · 0013 knowledge in schemas and skills · 0014 modules behind interfaces
- **Athlete anchors**: 0003 coaching context MAP zones
- **Coaching**: 0004 coaching philosophy as a tracked skill
- **Workout library**: 0005 workout templates as tracked files · 0011 MAP ramp ladder length follows MAP
- **Prescription**: 0007 local workout text parsing · 0010 work steps declared in the label
- **Execution review**: 0006 device laps as the execution record
- **Track**: 0008 timed splits are tracked records · 0012 FIT files rewritten in place
- **Skill evals**: 0009 skill evals
