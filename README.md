# intervals-icu-coach

An MCP server, CLI and set of coaching skills for your [Intervals.icu](https://intervals.icu) training data. The MCP server works with Claude Desktop and other MCP-compatible clients; the CLI and skills power a coach mode in Claude Code.

## Features

- **34 tools** covering activities, calendar events, fitness metrics, power curves, workout creation, a managed workout library, wellness, analysis, weekly summaries, planned-vs-actual session verification, intensity-distribution comparison, a one-call execution review, load forecasting, a power-profile report, track lap-split alignment, sensorless track speed and timed session records, and a one-call coaching snapshot
- **Structured workout creation**: build interval sessions on your Intervals.icu calendar using the native workout text syntax
- **Workout library as tracked files**: curated workouts live as Markdown templates in `templates/workouts/`, written in %MAP / %FTP. One command renders them at your current test values and reconciles your Intervals.icu library, so absolute watts follow your fitness.
- **Coach mode** (Claude Code, from a clone): repo skills carry the coaching logic — `coaching-philosophy` (durable principles, tracked in git), `coaching-session`, `plan-workout` and `plan-strength-training`. Personalise with your gitignored `docs/personal/steering.md` (overrides that win on conflict) and `season.md`. Athlete state (FTP, zones, fitness) comes from the `get_coaching_context` tool — always fresh, no files to maintain.
- **Analysis tools**: aerobic decoupling, interval comparison, power curves, and fitness trends

## Quick Start

### One-Click Install (Claude Desktop)

1. Download the latest `.mcpb` file from [Releases](https://github.com/robertgregorywest/intervals-icu-coach/releases)
2. Double-click the `.mcpb` file — Claude Desktop will open and prompt you to install
3. Enter your Intervals.icu API key when prompted (find it under **Settings → API**)

No Node.js installation required. Claude Desktop bundles its own runtime.

### Manual Configuration (Claude Desktop)

Requires **Node.js 20+**.

1. Clone and build:

   ```bash
   git clone https://github.com/robertgregorywest/intervals-icu-coach.git
   cd intervals-icu-coach
   npm install
   npm run build
   ```

2. Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

   ```json
   {
     "mcpServers": {
       "intervals-icu": {
         "command": "node",
         "args": ["/absolute/path/to/intervals-icu-coach/dist/mcp/stdio.js"],
         "env": {
           "INTERVALS_API_KEY": "your-api-key"
         }
       }
     }
   }
   ```

3. Restart Claude Desktop.

## Available Tools

| Tool                             | Description                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get_athlete`                    | Get athlete profile including FTP, LTHR, weight, HR/power/pace zones                                                                                                                                                                                                                                                                                                                         |
| `get_activities`                 | List activities in a date range with summary metrics (TSS, IF, NP, HR, power)                                                                                                                                                                                                                                                                                                                |
| `get_activity`                   | Get full details for a single activity, optionally with detected intervals                                                                                                                                                                                                                                                                                                                   |
| `get_activity_laps`              | Get the laps the device recorded (start, duration, avg/NP watts, HR, cadence, distance) — the recorded effort, not derived intervals                                                                                                                                                                                                                                                         |
| `get_activity_streams`           | Get raw time-series data for an activity (power, HR, cadence, speed, altitude)                                                                                                                                                                                                                                                                                                               |
| `get_events`                     | List calendar events (planned workouts, races, notes) in a date range                                                                                                                                                                                                                                                                                                                        |
| `get_event`                      | Get details of a single calendar event including workout structure                                                                                                                                                                                                                                                                                                                           |
| `update_event`                   | Update an existing calendar event (name, description, date, category, type, colour); pass `steps` (and `notes`) to rebuild a workout's structure                                                                                                                                                                                                                                             |
| `delete_events`                  | Delete one or more calendar events by ID or external_id                                                                                                                                                                                                                                                                                                                                      |
| `create_workout`                 | Create a structured workout on the calendar with steps, ramps, and repeat blocks                                                                                                                                                                                                                                                                                                             |
| `schedule_library_workout`       | Schedule a saved library workout, copying its description verbatim (prose, steps, template trailer)                                                                                                                                                                                                                                                                                          |
| `create_strength_workout`        | Create a strength/gym session as a WeightTraining event                                                                                                                                                                                                                                                                                                                                      |
| `list_workout_library`           | List the athlete's saved workouts in Intervals.icu (folders + name + one-line summary). Optional `folder` filter                                                                                                                                                                                                                                                                             |
| `get_workout_library_item`       | Get the full body of a saved workout, plus the `seedId` of the template it renders from                                                                                                                                                                                                                                                                                                      |
| `sync_workout_library`           | Render every tracked template at the MAP/FTP you pass and upsert it: creates what's missing, updates what changed, re-anchors watts. Never deletes                                                                                                                                                                                                                                           |
| `delete_workout_library_item`    | Delete a saved library workout by id. Clears sync orphans; a workout with a template file is recreated by the next sync                                                                                                                                                                                                                                                                      |
| `get_wellness`                   | Get wellness data for a date range (CTL, ATL, weight, HRV, sleep, subjective metrics)                                                                                                                                                                                                                                                                                                        |
| `get_fitness_summary`            | Today's fitness snapshot — CTL, ATL, TSB, HRV, sleep, and readiness                                                                                                                                                                                                                                                                                                                          |
| `get_power_curve`                | Get the athlete's power-duration curve for a date range or all time                                                                                                                                                                                                                                                                                                                          |
| `get_aerobic_decoupling`         | Calculate aerobic decoupling (Pw:Hr) for an activity — measures cardiac drift                                                                                                                                                                                                                                                                                                                |
| `compare_intervals`              | Compare intervals across multiple activities side-by-side                                                                                                                                                                                                                                                                                                                                    |
| `compare_planned_vs_actual`      | Verify a session was executed as prescribed — pairs an activity with its planned event and reports each step's prescription against delivery, rep by rep, read from the laps the head unit recorded. Declines to guess when it can't align                                                                                                                                                   |
| `compare_intensity_distribution` | Was the prescribed _dose_ delivered? Computes planned and delivered time-in-zone in one frame (from the prescription's steps and the recorded power, not from platform figures), plus the 76–106% FTP middle-band roll-up, for a session or a date range. Needs no step alignment, so it works where `compare_planned_vs_actual` refuses                                                     |
| `get_execution_digest`           | The execution review for a date window in one call: which key sessions it held, how much of the prescribed dose landed, and the work steps (declared by their label's first word) that missed their prescription                                                                                                                                                                             |
| `get_training_week_summary`      | Bundle activities + wellness + planned events for a week into one snapshot                                                                                                                                                                                                                                                                                                                   |
| `get_coaching_context`           | One-call snapshot — athlete profile, today's CTL/ATL/TSB, a wellness trend (default 7d, max 30d), and **MAP** derived from the most recent `MAP ramp test*` activity in the last 90 days                                                                                                                                                                                                     |
| `forecast_training_load`         | Forecast the CTL/ATL/TSB trajectory of proposed sessions **without writing to the calendar**. Proposed sessions overlay what is already planned, keyed by date, so a partly-fixed week needs no restating                                                                                                                                                                                    |
| `compute_power_profile`          | The cyclecoach.com power-profile report (Ric Stern) — CycleCoach zones, FTP-vs-MAP sanity check, VO₂max and classification, allometric MAP benchmark, Compound Score and PSTS. Every input is pulled from Intervals.icu by default and every one can be overridden                                                                                                                           |
| `compute_track_lap_power`        | Join a track lap-timer export (pasted, or taken from a stored session via `sessionId`) to the activity's streams for per-lap power, cadence and HR per run. Alignment is fitted by matching recorded cadence to the cadence each lap time implies, and every run reports its residual, offset interval and verdict — a weak or ambiguous fit withholds per-lap readings rather than guessing |
| `write_track_runs`               | Write a track session's scored runs onto the activity as Intervals.icu intervals — one per run, rolling entry excluded — so they show on the chart and feed Intervals.icu's own interval tools                                                                                                                                                                                               |
| `create_drivetrain_speed_fit`    | Add speed and distance to a track ride recorded without a speed sensor: rewrites the original FIT upload with speed from cadence through the known gear (chainring/cog × rollout), lap/session totals recomputed, everything else copied byte for byte — written locally to upload yourself. Checks it against any sensor it replaced and, with `sessionId`, the lap splits                  |
| `list_track_sessions`            | List the tracked timed-session records: date, event, gear, and each run's lap count, distance and time. Reads local files, so it returns an empty list plus the directory searched when the athlete keeps none                                                                                                                                                                               |
| `get_track_session`              | One record and everything its splits imply — per lap the split, cumulative time, speed and the cadence the gear demands; per run the flying-portion aggregates (a standing lap is reported and excluded from every average), the opening/closing segments, the decline `(v_close/v_open)³ − 1`, and the Σv² pacing figures                                                                   |
| `compare_track_sessions`         | The head-to-head table for reading a race against the races before it: every lap position with each run's split and its delta against the first run listed, plus total, flying, segment and decline rows. Refuses runs of differing lap counts rather than half-matching them                                                                                                                |

## Coach mode

The MCP server covers the Intervals.icu interaction — the tools above, in any MCP client. Coach mode is the layer above it: Claude Code skills (`coaching-session`, `plan-workout`, `plan-strength-training` and the forked skills they delegate to) that reach Intervals.icu through the repo's `./bin/icu` CLI and read and write your personal files in `docs/personal/`. They need the repo itself, so coach mode means working from a clone:

```bash
git clone https://github.com/robertgregorywest/intervals-icu-coach.git
cd intervals-icu-coach
npm install
cp .env.example .env   # then set INTERVALS_API_KEY — ./bin/icu loads it
claude                 # run Claude Code from the repo root
```

Then start a session with `/coaching-session`.

Coach mode is a four-tier context stack — most-durable first, later tiers override earlier ones on conflict — none of which require restarting the server:

| Concern                           | Where it lives                                                                                              | How to update                                              |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Coaching philosophy (durable)     | `coaching-philosophy` skill at [`.claude/skills/coaching-philosophy/`](.claude/skills/coaching-philosophy/) | Edit the skill files; commit                               |
| Personal overrides + season       | `docs/personal/steering.md` (overrides, win on conflict) + `docs/personal/season.md` (gitignored)           | Edit the files                                             |
| Workout-generation rules          | `plan-workout` and `compose-workout` skills under [`.claude/skills/`](.claude/skills/)                      | Edit the skill files; re-load Claude                       |
| Athlete state (FTP, MAP, fitness) | `get_coaching_context` tool                                                                                 | Always fresh — re-tested values flow through automatically |

The durable coaching **philosophy is tracked in git** as the `coaching-philosophy` skill — the base every install shares. A single athlete personalises it with the gitignored `docs/personal/steering.md` (overrides) and `season.md`; when a steering tweak proves durable, promote it up into the skill.

**Bootstrapping**: copy the scaffolds at [`templates/personal/`](templates/personal/) into `docs/personal/` and fill in `season.md` and `steering.md`. `coaching-log.md` is created by the first session.

## Workout library

`intervals-icu-coach` treats your Intervals.icu library (the saved-workouts feature) as a first-class template store the LLM can read and write:

- **Browse**: `list_workout_library` returns folders plus, for each workout, a one-line summary, a `purpose` saying what it is _for_, and `hasTemplate` marking the ones sync maintains. `get_workout_library_item` returns the full body and its `seedId`.
- **Author**: write a Markdown file in [`templates/workouts/`](templates/workouts/) — frontmatter (`seedId`, `name`, `folder`, `purpose`, optional `basis`) plus a body in Intervals.icu step syntax. A bare `%` is resolved against `basis` at render; literal watts, zones, `% LTHR` and cadence pass through untouched. Repeats may nest by indentation.
- **Sync**: `sync_workout_library` renders every template at the supplied MAP/FTP (a template whose basis is left unsupplied is skipped) and upserts it, matched by a `<!-- template: <seedId> -->` marker. It creates what's missing, updates whatever differs (steps, prose, name or folder), and re-anchors watts when a test value moves. Idempotent — it skips anything already identical. Use `dryRun` to preview.

The template files are the source of truth; the Intervals.icu library is a rendered view, so edits made in the Intervals.icu UI are overwritten on the next sync. Sync never deletes: a workout whose template has gone is reported as an orphan. See [ADR 0005](docs/adr/0005-workout-templates-as-tracked-files.md).

## Example Prompts

Activities, training, and analysis:

- "What activities did I do last week and how was my training load?"
- "What's my current fitness — CTL, ATL, and form?"
- "Show me my power curve for the last 90 days"
- "What's the aerobic decoupling on my last long ride?"
- "How has my FTP changed over the last year?"
- "Compare the power output across my last 5 interval sessions"

Calendar and workout creation:

- "Create a 4x8 minute threshold workout at 250w with 4 minute recoveries for next Tuesday"
- "Add a strength session to my calendar for tomorrow — 3 sets of squats, deadlifts, and lunges"

Coach mode + workout library (from a clone, once `docs/personal/` is set up):

- "Plan the next two weeks based on my current macro phase"
- "Browse my workout library and pick something appropriate for tomorrow given my fatigue"
- "Save this VO2 session you just designed as a reusable template"
- "My MAP just retested at 410W — refresh the library"

## Environment Variables

| Variable               | Required | Default | Description                               |
| ---------------------- | -------- | ------- | ----------------------------------------- |
| `INTERVALS_API_KEY`    | Yes      | —       | API key from Intervals.icu Settings → API |
| `INTERVALS_ATHLETE_ID` | No       | `0`     | Athlete ID (0 = authenticated user)       |

## Development

```bash
npm run build       # Compile TypeScript
npm test            # Run tests
npm run typecheck   # Type-check without emitting
npm run check:manifest  # Check manifest.json declares every registered tool
npm start           # Run MCP server via stdio
```

## License

MIT
