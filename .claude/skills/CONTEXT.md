# Coaching

The skill layer: the coaching-context stack the coaching skills read at session-start, the briefs they hand to their forked build skills, and the review window they sweep. Covers the skills in this folder and the gitignored `docs/personal/`.

One context of this repo's domain language; see the [context map](../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Workout brief**:
The distilled decision a coaching skill hands to its forked build skill: what to build, the context that shapes it (block, constraints, recent load) and when. One per discipline, each with a single caller — `plan-workout` → `compose-workout` (adds the library item or compose fresh, and the anchors) and `plan-strength-training` → `compose-strength-session` (the **strength brief**; adds the template tier). Each is defined once, in its build skill's "Your input"; the caller points there rather than restating it. The decision is made on the coaching thread; the brief carries it to the build.
_Avoid_: "prompt" or "spec" — the brief is a fixed contract, not free-form instructions

**Review window / watermark**:
The span an execution review sweeps, running from the `reviewed-through` date in the coaching log's live-state header to today. Advanced to today only as part of a confirmed log write, so an unconfirmed session leaves the window intact. Capped at 28 days counting both ends (the block cadence), checked once by the **Paired session loader**; skipped when the window holds no key session.
_Avoid_: "since last time" or any window derived from conversation history rather than the watermark — the watermark is what makes the review neither re-review nor silently skip.

**Coaching philosophy**:
The athlete's durable, timeless training principles — foundational pillars, intensity anchor (MAP), execution rules, biases, test cadence. **Tracked in git** as the `coaching-philosophy` skill and shared by every install; the base layer of the Coaching-context stack. Editing it is a commit (see ADR 0004).
_Avoid_: putting season-scoped or current-state facts here (those are **Season** / athlete state); calling one athlete's deviations "philosophy" (that's **Steering**).

**Steering**:
A single athlete's thin, personal override layer (`docs/personal/steering.md`, gitignored) on top of the shared **Coaching philosophy**. **Wins on conflict.** Durable steering is promoted _up_ into the philosophy skill.
_Avoid_: durable training beliefs that would hold next season (promote them into philosophy); block-scoped plans (that's **Season**).

**Season**:
Personal, gitignored current-block context (`docs/personal/season.md`) — race calendar, macro structure, block constraints. Revised between blocks.
_Avoid_: momentary CTL/TSB and in-flight niggles (that's the coaching log); timeless principles (that's **Coaching philosophy**).

**Coaching-context stack**:
The four ordered tiers the coaching skills read at session-start, most-durable first: **Coaching philosophy** → **Steering** → **Season** → coaching log. Later tiers override earlier ones on conflict; facts promote _up_ the stack as they prove durable (log→season, steering→philosophy).
_Avoid_: confusing this with `get_coaching_context`'s output — that is live **athlete state** (FTP/MAP/zones/CTL), a separate input, not a tier in the stack.
