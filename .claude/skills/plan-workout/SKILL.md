---
name: plan-workout
description: Plan a single cycling/running workout on Intervals.icu — decide the session and whether a library workout fits, then hand the build to compose-workout. Use when the user asks to plan, build, or design a workout or intervals session. For a broader training conversation (load review, week/block planning, race readiness), suggest the athlete run /coaching-session.
---

# plan-workout

## Decide here, build in the fork

This skill decides _what_ to build — the session for the day, and whether a library workout fits —
with the athlete in the conversation and the context stack loaded. The build itself always goes to
the **`compose-workout`** skill, which runs forked, out of this conversation: invoke it with the
**workout brief** its "Your input" section defines. It owns the mechanics — power conversion,
session structure, workout-text syntax, the write tools — so they never load here. The same holds
whether you arrived from a `coaching-session` or the athlete asked you directly.

## Session-start moves

Read `docs/agents/icu-cli.md` (from the project root) before your first CLI call — working
directory, piping, `describe`. You run at its **Read-only** tier: the build is `compose-workout`'s.

**Reuse, don't repeat.** If you arrived from a `coaching-session` (or already pulled them this turn), the `get_coaching_context` snapshot and the personal files (`steering.md`, `season.md`) are already in context — reuse them, don't re-fetch. `list_workout_library` is _not_ usually among them, so run it regardless. Invoked cold, do both calls in parallel:

1. **`get_coaching_context`** — today's snapshot: FTP, **MAP** and **`mapZones`** (the canonical coaching zones), load and the wellness trend. Pass `days` up to 30 when planning a longer block. Don't ask the athlete for FTP, MAP, zones, or current fitness — read them. If `map` is null, follow `mapWarning` — ask the athlete for a current MAP estimate before prescribing %MAP-anchored work.
2. **`list_workout_library`** — surfaces the workouts the athlete has curated. Each carries a **`purpose`** saying what it is _for_ — select on that, not on the name. `hasTemplate: true` means `sync_workout_library` maintains it, so its watts track the athlete's current tests. Reusing a library workout is almost always preferable to composing fresh.

The athlete's coaching philosophy is the tracked **`coaching-philosophy` skill** — read `.claude/skills/coaching-philosophy/SKILL.md` for pillars, intensity anchor, execution rules, biases, and "never" rules (drill into its topic subfiles as needed) unless it's already in context. Personal overrides live in **`docs/personal/steering.md`** (they **win on conflict** — apply them and say so) and the current season in **`docs/personal/season.md`**. The philosophy skill ships with the repo; if `steering.md` or `season.md` is missing, point the athlete at the scaffolds in `templates/personal/`.

## Decision tree

```
User asks for a workout
    │
    ▼
get_coaching_context  +  list_workout_library     (parallel)
    │
    ▼
Does a library workout fit the intent?
    │
    ├── Yes → library decision = that item's id
    │
    └── No  → library decision = compose fresh. Ask: should it be saved to the library for reuse?
    │
    ▼
Replacing a planned event? (agree it with the athlete, note its id)
    │
    ▼
workout brief  →  compose-workout (forked)  →  one holding line, end turn
    │
    ▼
report arrives  →  relay it
```

**The build is a barrier.** `compose-workout` runs in the background: invoking it returns only an
agent name, and its report arrives later as a notification. After dispatching, write one holding
line ("Building <session> for <date>…") and end the turn. Relay what was written — or why the build
stopped — only from the report itself.

See [library-vs-compose.md](library-vs-compose.md) for the full reasoning.

## Constraints

- **Never** invent FTP/MAP — always derive from `get_coaching_context`.
- **Defer** to library workouts when the intent matches. Calibration drift between library and ad-hoc is real.
- **Respect** the `coaching-philosophy` skill and the personal `docs/personal/` docs: bias, execution rules, "never" rules, weekly volume caps. `docs/personal/steering.md` overrides the philosophy on conflict.
