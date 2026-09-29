# Skill evals: a guide

The coaching skills are prompts. When a skill is edited, or a new model arrives, the only way to
know whether coaching got better or worse is to run it on real situations and check what it did.
The skill evals do that: they replay real moments from your training history through the skills,
score each run with a set of graders, and let you compare one set of results against another.

The design decisions are recorded in [ADR 0009](adr/0009-skill-evals.md), and the build history in
issue #20. This guide is about using the evals.

> **Evals are manual and they cost money.** Each trial is a full agent session and each
> `llmRubric` grader makes three judge calls. Nothing here runs in `npm test`, the pre-commit hook
> or the release. The runner stops launching new runs once `--max-cost-usd` (default $10) is spent.

## Contents

- [The moving parts](#the-moving-parts)
- [Setup](#setup)
- [What a run does](#what-a-run-does)
- [Capture and replay of Intervals.icu data](#capture-and-replay-of-intervalsicu-data)
- [Running the evals](#running-the-evals)
- [Reading results](#reading-results)
- [Comparing two result sets](#comparing-two-result-sets)
- [Re-grading without the agent](#re-grading-without-the-agent)
- [Seeing which cases exist](#seeing-which-cases-exist)
- [Adding a new case](#adding-a-new-case)
- [Adjusting a case](#adjusting-a-case)
- [Grader reference](#grader-reference)

## The moving parts

| Term         | Meaning                                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Scenario** | (also "case") A real moment frozen for evaluation: a prompt, a scenario date that stands in for "today", your personal files as they were, and graders. |
| **Cassette** | The scenario's recorded Intervals.icu responses, replayed so a run never touches the live account.                                                      |
| **Grader**   | One check on a run: pass or fail, with an explanation.                                                                                                  |
| **Trial**    | One agent run of one scenario at one model × effort.                                                                                                    |
| **Cell**     | All the trials of one scenario at one model × effort (and arm). Results are reported per cell.                                                          |
| **Arm**      | `skills`, the case as written, or `no-skills`, the baseline: the same case with the skills removed.                                                     |

The code is split between two repos:

| Where                                      | What                                                              | Repo    |
| ------------------------------------------ | ----------------------------------------------------------------- | ------- |
| `evals/skills/`                            | The runner, graders, and the capture, compare and case-list tools | public  |
| `docs/personal/evals/scenarios/<skill>/`   | One directory per case                                            | private |
| `docs/personal/evals/results/<timestamp>/` | One directory per eval run                                        | private |

Scenarios hold your steering, season plan, coaching log and platform data, so they never go in the
public repo. Commit them in `docs/personal`.

A case directory looks like this:

```
docs/personal/evals/scenarios/plan-workout/pw-replace-sat-19/
  case.yaml     the prompt, scenario date, and graders
  personal/     steering.md, season.md, coaching-log.md … as they stood on the scenario date
  cassette/     one JSON file per recorded Intervals.icu GET
```

## Setup

- **Claude login.** The Agent SDK uses your Claude Code login, so no API key is needed.
- **Eval dependencies.** `@anthropic-ai/claude-agent-sdk` and `yaml` are root devDependencies, so
  `npm install` brings them and `npm run typecheck` checks `evals/` with the rest. `mcpb clean`
  strips devDependencies from the bundle, so they never ship.
- **`.env`.** Recording needs `INTERVALS_API_KEY` in `.env`. Replay reads only
  `INTERVALS_ATHLETE_ID`, because cassette keys contain the athlete id.

## What a run does

For each trial the runner:

1. **Builds a workspace.** It copies your working tree to a temporary directory, including
   uncommitted skill edits, since those are usually what you're testing. `evals/`, `tests/`, this
   guide, ADR 0009, the `eval-case` skill and your real `docs/personal` are left out, so the agent
   can't see the cases or how they're graded. The
   case's `personal/` files go into the workspace's `docs/personal/`.
2. **Makes forked skills use the model under test.** The `ride-analyst` and
   `workout-composer` agent definitions pin `model: sonnet`. The workspace copy switches them to
   `inherit`. Pass `--subagent-model pinned` to keep sonnet.
3. **Replays Intervals.icu.** `./bin/icu` answers from the cassette and captures writes instead of
   sending them (see the next section). `ICU_NOW` pins "today" to the scenario date, and the agent
   is told that date too.
4. **Runs the prompt.** It sends the prompt through the Agent SDK at the chosen model and effort,
   then any `followups:` as later user turns. It stops at `maxTurns`, at `timeoutSeconds`, or at
   `--run-budget-usd`.
5. **Grades the run.** Each grader in `case.yaml` runs. The run's score is the weighted share of
   graders that passed, and the run passes only when every scored grader passes.

## Capture and replay of Intervals.icu data

The skills reach Intervals.icu only through `./bin/icu`, so recording and replay are built into it.
Environment variables switch the modes. With none set, `bin/icu` behaves as normal.

| Mode       | Switch                                     | GET requests                                                      | Writes (POST/PUT/DELETE) |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------- | ------------------------ |
| **Record** | `ICU_RECORD_DIR`                           | Sent live; each successful response is saved to the cassette      | Captured, never sent     |
| **Replay** | `ICU_REPLAY_DIR`                           | Answered from the cassette; an unrecorded one is logged as a miss | Captured, never sent     |
| **Top-up** | `ICU_REPLAY_DIR` plus `ICU_RECORD_MISSING` | Answered from the cassette; anything missing is fetched and added | Captured, never sent     |

You never set these variables yourself; the runner sets them. Some points to know:

- **Writes never reach your calendar, even when recording.** Each write is appended to the run's
  `writes.jsonl` and gets a synthetic success response (a created event echoes back with a fake
  id), so the skill carries on as normal. Graders read what it _would_ have written.
- **How responses are keyed.** Each cassette entry is keyed by method, path and sorted query
  string, for example `GET /api/v1/athlete/i123/events?newest=2026-09-19&oldest=2026-09-19`. The
  file name is a hash of that key, and the key sits at the top of each JSON file.
- **Failed responses aren't saved.** A transient 5xx never becomes part of a cassette.
- **Misses are reported, not scored.** If a model asks for something the recording doesn't cover,
  it gets a clear error and the request is written to `misses.jsonl`. The `noReplayMisses` grader
  reports it without affecting the score.
- **The recording is only as wide as the run that made it.** It holds whatever the first model
  happened to ask for. A different model, or the same one on another day, may ask for more. When
  `noReplayMisses` fails, top up the cassette:

  ```sh
  npm run eval:skills -- --case pw-replace-sat-19 --models claude-opus-5 --record-missing
  ```

  A top-up replays what is already recorded and fetches only the gaps. Because the scenario date
  is in the past, the live account still returns the same history for it.

## Running the evals

```sh
# Everything, with the defaults: sonnet-5, medium effort, 3 trials
npm run eval:skills

# One case, one quick trial
npm run eval:skills -- --case pw-replace-sat-19 --models claude-sonnet-5 --effort low --trials 1

# A sweep across two models, two efforts and every plan-workout case
npm run eval:skills -- --skill plan-workout --models claude-sonnet-5,claude-opus-5 --effort low,high --trials 3
```

| Flag                            | Default           | Purpose                                                 |
| ------------------------------- | ----------------- | ------------------------------------------------------- |
| `--case <glob>`                 | all               | Case ids, e.g. `pw-*`                                   |
| `--skill <name>` / `--tag <t>`  | all               | Filter by the case's `skill:` or `tags:`                |
| `--models a,b`                  | `claude-sonnet-5` | Models to sweep                                         |
| `--effort low,high`             | `medium`          | `low`, `medium`, `high`, `xhigh`, `max`                 |
| `--trials N`                    | `3`               | Trials per cell                                         |
| `--concurrency N`               | `2`               | Runs in parallel                                        |
| `--max-cost-usd X`              | `10`              | Stops launching runs once this has been spent           |
| `--run-budget-usd X`            | `3`               | Cap on a single run                                     |
| `--judge-model id`              | `claude-sonnet-5` | Model for `llmRubric`; keep it fixed across comparisons |
| `--subagent-model`              | `inherit`         | `pinned` keeps forked skills on sonnet                  |
| `--keep-workspace`              | off               | Keeps the temporary workspace so you can inspect it     |
| `--baseline-no-skills`          | off               | Adds the no-skills arm (see below)                      |
| `--record` / `--record-missing` | off               | Fill or top up cassettes (see above)                    |

### The no-skills baseline

`--baseline-no-skills` runs every case a second time with `.claude/skills` and `.claude/agents`
removed from the workspace. A case that scores as well without the skills points at a skill the
model no longer needs. In that arm `skillInvoked` reports without scoring, since there is nothing to
invoke, and cases whose prompt is a slash command sit it out, since the command is the skill. Runs
land under `<model>__<effort>__no-skills/` and print with `(no-skills)`.

## Reading results

The runner prints a line for each run, with the failing graders under it. At the end it prints a
table with one row per cell (the figures below are illustrative):

```
FAIL pw-replace-sat-19 claude-sonnet-5/low t1  score 0.78  $0.31  812k/21k tok  9 turns  62s
     ✗ trimmed-2x15-at-88-95pct: PUT Threshold 2×20 on 2026-09-19: "Threshold" at 275–305 W, outside 252–272 W; …

CASE               MODEL            EFFORT  SCORE  PASS%  PASS^k  $/RUN  TOKENS    TURNS
pw-replace-sat-19  claude-sonnet-5  low     0.78   0%     no      0.31   812k/21k  9.0

MODEL            EFFORT  CASES  SCORE  PASS^k  $/RUN  TOKENS    TURNS
claude-sonnet-5  low     1      0.78   0/1     0.31   812k/21k  9.0
```

- **SCORE** is the cell's mean score. **PASS%** is the share of trials that passed.
- **PASS^k** is `yes` only if every trial passed. It's the strictest measure and the one to watch:
  a coach that gets it right two times out of three is not reliable.
- **TOKENS** is read / written: fresh plus cached input, then output, summed over every model the
  session used, forked skills included.
- The second table rolls the cells up by model × effort across cases. Its PASS^k counts the cells
  where every trial passed.
- The results directory, `docs/personal/evals/results/<timestamp>/` (with a `-record` or `-top-up`
  suffix for those modes), contains:
  - `config.json`: the models, efforts, judge, git sha, and `skillsDirty` (whether uncommitted
    skill or source edits were included in the run)
  - `summary.json`: the model × effort roll-up, every cell, and every run's grades and explanations
  - `runs/<case>/<model>__<effort>/t<n>/`:
    - `transcript.jsonl`: the full agent session
    - `final.md`: its final reply
    - `writes.jsonl`: what it would have written
    - `misses.jsonl`: what the cassette lacked
    - `run.json`: the run record and its grades

To find out why a run failed, read the grader explanation first, then `final.md`, then
`writes.jsonl`. Go to the transcript only if you still need to.

## Comparing two result sets

To assess a new model, or an edit to a skill, run the same cases again and compare against a stored
baseline:

```sh
npm run eval:skills -- --skill plan-workout --models claude-opus-5 --effort medium --trials 3
npm run eval:compare -- 2026-09-13T17-22-58-117Z 2026-09-20T09-00-00-000Z
```

Each argument is a results directory, or just its timestamp name. The first is the baseline and the
second is the candidate.

- **How cells are paired.** Cells pair on case × model × effort × arm. If each side ran a single, different
  model (or effort), that dimension is the thing being compared, so cells pair across it: `sonnet/low`
  on the left against `opus/low` on the right.
- **What it prints.** One row per cell, showing score, pass^k and cost as baseline → candidate. A
  cell whose score fell by more than `--threshold` (default 0.1) is marked `▼ REGRESSED`, with the
  graders whose pass rate dropped listed under it. Cases found on only one side are listed as
  unpaired.
- **The roll-up.** At the bottom, a roll-up for each side covers the paired cells only.
- **Exit code.** It exits 1 when any cell regressed.

Compare like with like:

- Use the same judge model and the same trial count on both sides. The tool warns if the judges
  differ.
- Check the header line for `(dirty)` or `PARTIAL`. `PARTIAL` means the cost ceiling skipped runs.

## Re-grading without the agent

`eval:grade` runs a case's current graders over a run without starting the agent, so it costs
nothing (unless you pass `--judge`, which also runs `llmRubric`):

```sh
# A stored run, after you've edited the case's graders
npm run eval:grade -- --case pw-replace-sat-19 \
  --run docs/personal/evals/results/<timestamp>/runs/pw-replace-sat-19/claude-sonnet-5__low/t1

# A hand-made bad run, to prove the graders catch it
npm run eval:grade -- --case pw-replace-sat-19 --writes bad-writes.jsonl [--final bad-final.md]
```

A hand-made run is the writes a bad run would make, one `{"method", "path", "body"}` per line in
the same shape as a real `writes.jsonl`, and/or its reply as text. It has no transcript, so
`completed`, `skillInvoked` and `noReplayMisses` are skipped. A case earns its place when the bad
run you'd expect from a plausible model FAILS.

## Seeing which cases exist

```sh
npm run eval:cases                      # every case, grouped by skill
npm run eval:cases -- --skill plan-workout
npm run eval:cases -- --tag seed
```

For each case this prints its id, scenario date, tags, how many responses its cassette holds (or a
warning that it has none), the prompt, the first line of its description and the graders it runs.
The `description:` in each `case.yaml` should say what real moment the case captures and what a good
run does, so this listing doubles as the coverage map.

To see what a case checks in detail, open its `case.yaml`. Comments there record the ground truth
the graders were written from, for example what actually happened in the session being reviewed.

## Adding a new case

A case should come from a real moment in your history where you know what good coaching looks like:
a review window where you know what should be reported, or a planning request where the season plan
or steering dictates the answer. Aim for a mix: typical cases, edge cases, and _negative_ cases,
where the right answer is to push back or write nothing.

The `/eval-case` skill walks through the steps below with you. It suggests moments that fill gaps
in the suite, interviews you for the ground truth, takes exact grader values from the recorded
data, and calibrates the graders against your verdict on trial runs. It asks before every step that
costs money. The steps also work by hand.

**1. Capture it.** Choose the date the moment happened and the prompt you would have typed:

```sh
npm run eval:capture -- --skill plan-workout --id pw-midweek-cap \
  --date 2026-09-16 --prompt "Only 60 minutes tonight — what should I ride?" \
  --description "Wed with a 60-min cap; season.md has threshold maintenance this week." \
  --tags seed
```

This does two things:

- It copies `steering.md`, `season.md`, `coaching-log.md` and `track-context.md` from the
  `docs/personal` git history as they stood on that date (the last commit on or before it; `--rev`
  picks a specific one).
- It drops log entries dated after the scenario, since the future isn't known yet. If the history
  doesn't go back that far, it uses today's files and tells you to edit them back to the date.

It then writes a `case.yaml` skeleton with the standard graders for the skill, with `TODO`s where
expectations are needed.

**2. Fill in the expectations.** Edit `case.yaml`:

- Replace the `TODO`s with what a good run does: the exact writes, the watt band, the time cap, the
  terms the reply must mention, and a rubric for anything that needs judgement (see the
  [grader reference](#grader-reference)).
- Write the ground truth in a comment, so that anyone adjusting the case later knows where the
  numbers came from.

**3. Record the cassette.** This runs the case once, live, with writes still captured and never
sent:

```sh
npm run eval:skills -- --case pw-midweek-cap --record
```

(or pass `--record` to `eval:capture` in step 1 to do it immediately). Recording uses one trial on
the first model and effort.

**4. Replay it and check the graders.** Run a trial or two on replay and read the grader
explanations:

```sh
npm run eval:skills -- --case pw-midweek-cap --models claude-sonnet-5 --effort low --trials 2
```

A grader is useful when it passes a run you would accept and fails one you wouldn't. If it fails a
good run, loosen it. If it passes a bad one, tighten it or add a deterministic grader. Check
`noReplayMisses` too, and top up the cassette with `--record-missing` if it fails.

**5. Commit it** in the private repo:

```sh
git -C docs/personal add evals/scenarios/plan-workout/pw-midweek-cap
git -C docs/personal commit -m "evals: add pw-midweek-cap"
```

## Adjusting a case

Most adjustments are edits to `case.yaml`, and you don't need to re-record. After a grader edit,
check it for free with [`eval:grade`](#re-grading-without-the-agent) against stored runs and a
hand-made bad run. Any change to a case makes earlier results for it incomparable, so re-run it
before comparing.

| To change…                          | Do this                                                                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| What counts as a pass               | Edit the grader options, add or remove graders, or change a grader's `weight:` (0 reports without scoring).                             |
| The wording of a rubric             | Edit `criteria:`. Keep it as explicit PASS if / FAIL if conditions: the judge is strict and literal.                                    |
| The prompt or follow-ups            | Edit `prompt:` / `followups:`. If the new prompt makes the agent ask for other data, run once with `--record-missing`.                  |
| What the agent knows about the plan | Edit the files in the case's `personal/`. They are the athlete's world as of the scenario date, so don't bring in knowledge from later. |
| The scenario date                   | This is really a new case: capture it again with `eval:capture --force` and re-record.                                                  |
| Stale or incomplete data            | `--record-missing` adds what's missing. To start clean, delete `cassette/` and `--record` again.                                        |
| Case too slow or cut off            | Raise `maxTurns:` or `timeoutSeconds:`.                                                                                                 |

## Grader reference

Every grader takes an optional `name:` (shown in results and comparisons) and `weight:` (default
1). Graders that read the reply take `target:`: `skillReport` reads the forked skill's report, and
`final` (the default) the session's final reply. Each grader's options are checked when a case
loads, so a misspelt or missing option stops the run before anything is spent.

**Shared**

| Grader           | Passes when                                                                                                                                                                                                                                                 | Options                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `completed`      | The session finished normally, not on an error, the turn cap or the timeout                                                                                                                                                                                 | —                                                            |
| `skillInvoked`   | The skill ran (by the Skill tool or slash command). `skill: compose-workout` checks that plan-workout handed the build to its fork                                                                                                                          | `skill:` (defaults to the case's)                            |
| `awaitsFork`     | The session waited on the fork: reply text written before its report arrived (a background `task_notification`, or the tool result when it ran in the foreground) fits in `maxChars:`, a holding line. Catches analysis drafted before the review came back | `skill:` (defaults to the case's), `maxChars:` (default 280) |
| `cliTier`        | Every CLI command and captured write is within the skill's permission tier. Tiers come from the tool annotations the CLI enforces. The build tiers bar deletes but not other writes; `writes` pins those down                                               | `tier:` `read-only`, `build` or `build-replace`              |
| `readOnly`       | `cliTier` at `read-only`: no mutating CLI command and no captured write                                                                                                                                                                                     | —                                                            |
| `writes`         | The captured writes are exactly `expect:`: each `{method, path, body?}` (path and body are regexes, body tested against the JSON) matched once, nothing else                                                                                                | `expect:` (`[]` means write nothing)                         |
| `regex`          | `pattern:` is found, or with `match: not_contains`, absent                                                                                                                                                                                                  | `pattern:`, `flags:`, `target:`                              |
| `mentions`       | Every `mustMention:` term appears and no `mustNotMention:` term does (case-insensitive)                                                                                                                                                                     | `mustMention:`, `mustNotMention:`, `target:`                 |
| `llmRubric`      | A majority of three judge votes say PASS against `criteria:`                                                                                                                                                                                                | `criteria:`, `judgeModel:`, `target:`                        |
| `noReplayMisses` | Every request was in the cassette. **Reported only, never scored**                                                                                                                                                                                          | —                                                            |

**execution review** (on the `coaching-session` thread, which now runs the review itself)

| Grader                  | Passes when                                                                                                                                                                                                    | Options                                                                                                                      |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `watermarkLine`         | The review ends on `reviewed through: <date>` or `skipped: no key session in …`                                                                                                                                | `expect:` (a specific line)                                                                                                  |
| `noRawDump`             | The review holds findings only: no raw JSON (fenced or inline, nested or not) and no long tables                                                                                                               | `maxTableRows:` (default 8)                                                                                                  |
| `sessionsDispositioned` | Each key session lands where the ground truth says. `reported`: a line names it without marking it held. `held`: it isn't raised, so every line naming it (if any) says held, not raised, one-off or seen once | `sessions: [{match, as}]`, where `match` is a regex for how the report may name the session and `as` is `reported` or `held` |

**plan-workout**

These graders read the workouts the run wrote to the calendar (captured POST, bulk POST and PUT
requests on `/events`). They parse the text the way Intervals.icu would, and resolve `%` and `Z`
targets against the athlete's FTP and power zones, fetched as the skill would have seen them: through
a client replaying the case's cassette on its scenario date. All three take `date:` to look only
at the workout on that day, and fail if no workout was written.

| Grader           | Passes when                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Options                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `workoutParses`  | Every written workout parses into steps, with no line the platform would drop                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `date:`                                                                                                        |
| `targetsInBand`  | Every work step (a target at or above `workAbove`, by default 90% of the band's floor) sits inside the band. The band is a MAP zone, `zone: L5` or `zone: [L3, L4]`, taken from the scenario's `mapZones`; or explicit watts, `band:`, for an intent the zones don't draw, such as a %FTP prescription. With `workMinutes:`, the total time of those work steps is within range as well. That is how a trimmed 2×15 is told apart from a full 2×20 at the same watts. A workout with nothing in the band fails naming its hardest step. | `zone:` or `band: [lowW, highW]` (one of them), `tolerance:`, `workAbove:`, `workMinutes: {min, max}`, `date:` |
| `durationWithin` | The workout's total time is within range                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | `minMinutes:`, `maxMinutes:`, `date:`                                                                          |

Anchors can be overridden with `ftp:` and `powerZones:`, or `sport:` to read a sport other than
Ride.

To add a grader, export a `defineGrader(options, grade)` from `evals/skills/graders/<skill>.ts`:
`options` is a zod `strictObject` of what a case may set, and `grade` is
`(options, run, ctx) => { passed, explanation }`. If it's a new module, add it to
`graders/index.ts`. A case uses the grader by its export name as `type:`.
