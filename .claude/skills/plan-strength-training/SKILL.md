---
name: plan-strength-training
description: Plan a gym / strength session on Intervals.icu — decide block dose, template tier and placement, then hand the build to compose-strength-session — and reason about how strength supports the bike. Use when the user asks to plan, build, schedule, or review a gym / strength / lifting / S&C session, mentions squats/deadlifts/step-ups/jumps, asks how many gym sessions to run, or how strength transfers to the standing start or the pursuit.
---

# plan-strength-training

Strength-and-conditioning skill for the `intervals-icu-coach` project. Decides the gym session and
hands the build to the forked **`compose-strength-session`** skill, which schedules it as a
`WeightTraining` event. It is the strength sibling of `plan-workout` (which handles bike/run
workouts).

The method here is distilled from **Chris Peden (@chr1speden)** — S&C coach for the Decathlon CMA
CGM WorldTour team, owner of Combined Athletic Performance — whose whole message is: strength
_serves_ the endurance goal, and the coach's real job is deciding what **not** to prescribe. It is
the operational "how"; the durable "why" lives in the `coaching-philosophy` skill's
[strength pillar](../coaching-philosophy/strength.md).

## Decide here, build in the fork

Block, frequency, intent, readiness, template tier and placement — the decision tree below — are
decided here, with the athlete in the conversation and the season and philosophy context loaded.
The build always goes to the **`compose-strength-session`** skill, which runs forked, out of this
conversation: invoke it with the **strength brief** its "Your input" section defines. It reads the
exercise, session and periodization subfiles itself to fill the template in and schedules the
session. The same holds whether you arrived from a `coaching-session` or the athlete asked you
directly.

## Session-start moves

**Reuse, don't repeat.** If you arrived from a `coaching-session` (or already gathered these this
turn), the `get_coaching_context` snapshot and the personal files are already in context — reuse them,
don't re-fetch. Re-fetch only what's missing. Invoked cold, gather 1–2 in parallel:

1. **`get_coaching_context`** — today's CTL/ATL/TSB, ramp rate, readiness, and the 7-day wellness
   trend. Gym load is layered on top of an already-fatigued system; readiness gates volume. Don't
   ask the athlete for fitness — read it (or reuse the snapshot already in context).
2. **`docs/personal/season.md`** — the **current block** sets strength **frequency and intent**
   (build/reload vs maintain). Also `docs/personal/steering.md` (overrides win on conflict).
   The philosophy's [strength pillar](../coaching-philosophy/strength.md) and the execution rules in
   `.claude/skills/coaching-philosophy/SKILL.md` are the hard constraints.
3. **Know the week's hard bike/track days** (ask, or `get_events`) — placement matters as much as
   content (see Constraints). This is usually the one item a delegating `coaching-session` hasn't
   already gathered.

## Decision tree

```
User wants a gym session / strength plan
    │
    ▼
get_coaching_context  +  read season.md / steering.md      (parallel)
    │
    ▼
What block are we in?  →  frequency (×/week) + intent      → periodization.md
    │                      (build · reload · maintain · sharpen)
    ▼
Readiness OK + which bike days are hard this week?
    │
    ▼
Pick the template tier for the phase                       → sessions.md
    │
    ▼
Place it right (stack on a hard ride day; never before track;
    never a HI bike day after heavy lifting)
    │
    ▼
strength brief  →  compose-strength-session (forked)  →  one holding line, end turn
    │
    ▼
report arrives  →  relay it
```

**The build is a barrier.** `compose-strength-session` runs in the background: invoking it returns
only an agent name, and its report arrives later as a notification. After dispatching, write one
holding line ("Building <session> for <date>…") and end the turn. Relay what was written — or why the
build stopped — only from the report itself.

## The five principles (the lens for every decision)

One line each; the reasoning and source posts are in [principles.md](principles.md).

1. **Strength serves the bike** — aerobic work is always the higher priority; strength and fitness are built _together_, never traded off.
2. **Minimum effective dose** — as much as necessary, not as much as possible. Ask "what can I _remove_?" before "what can I add?"
3. **Train both ends of the force–velocity curve** — heavy builds the force ceiling; speed/jumps train how fast you reach it (RFD).
4. **Pick exercises by stimulus-to-fatigue ratio for the phase** — multi-joint over isolation, stable over unstable, specificity over novelty. → [exercises.md](../compose-strength-session/exercises.md)
5. **Individualise; evidence-informed, not evidence-blind** — no fixed template; decide for the athlete and the moment in the season.

## Constraints (respect the coaching-philosophy execution rules)

- **Frequency is set by the block** — read it from `season.md`. **Never exceed 2×/week.**
- **Auto-regulate load by RPE / bar velocity**, never prescribe absolute kg — the athlete's gym
  numbers are not in `get_coaching_context`, and Peden's method is intent-and-velocity led anyway.
- **Placement:** stack strength on a **hard ride day** (ride AM / gym PM, a few hours apart) so easy
  days stay truly easy. **No high-intensity bike day _after_ heavy lifting. Never a fatiguing gym
  day the day before a track session.** Two-a-days only on weekends / WFH days.
- **The bike is the priority.** If a session would compromise the quality of a key ride or track
  session, cut it or lighten it — that is the whole point of the method.

## The pursuit application

For a track pursuiter the **standing start** is where strength transfers most directly to the bike.
When the start is a limiter, that makes **maximal force + rate of force development from a dead stop**
the headline strength target — heavy low-rep bilateral work, loaded jumps, and dead-stop/accelerative
lifts. Read the season's **actual** strength target, limiters, and current block from
`docs/personal/season.md` (with `steering.md` overrides) — it changes through the year, don't assume.
How the dose shifts block-to-block is the off↔in-season model in
[periodization.md](periodization.md); ready-to-run templates are in [sessions.md](sessions.md).

## Provenance

Source: ~100 posts from @chr1speden downloaded to `docs/personal/instagram/chr1speden/` (gitignored)
and distilled here. This is one experienced practitioner's evidence-informed method, not a
peer-reviewed protocol — treat it as a strong, coherent coaching lens, and let the athlete's own
response and the `coaching-philosophy` skill arbitrate on conflict.
