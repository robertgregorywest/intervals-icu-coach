# Reaching Intervals.icu from a skill — the `./bin/icu` CLI

Shared by every coaching skill that calls Intervals.icu, the forked ones included. Each skill states
its own permission tier (below) and points here for the rest.

**Reach every Intervals.icu tool through `./bin/icu`, not through `mcp__intervals-icu__*`.** Both
adapters iterate the same registry and return the same JSON, but an MCP result lands in context
whole, where a Bash subcommand's output can be reduced before it ever gets there. Startup is ~0.25 s,
so there is nothing to trade off.

```
cd <repo root> && \
  ./bin/icu get_activity_streams --json '{"id":"i165853469","types":["watts","heartrate"]}' \
  | python3 -c '<compute and print only the figures you will quote>'
```

- **`<repo root>` is this checkout of the repo** — Claude Code's primary working directory. Substitute
  the absolute path; the skills never hard-code one, so they work in any clone.
- **`cd` to the project root in the same command.** The CLI reads `INTERVALS_API_KEY` from the repo's
  `.env`; run it from anywhere else and it fails with "Intervals.icu API key required". This is
  the most common way to break a call — the working directory does not persist reliably between them.
- **Pipe even the shaped results.** `forecast_training_load` returns every day and every week; if you
  are quoting weekly ramp, print the week rows and drop the rest. The habit matters more than any one
  call — deciding case by case whether a payload is "big enough to pipe" is how the discipline erodes.
- **Print only the handful of numbers you will use.** A downsampled long ride is 25–40 KB of JSON;
  compute the windows, averages or fits in the pipe.
- **Request only the streams you need.** Fewer streams means full resolution rather than a stride.
- **Save the payload to the scratchpad first** when a second pass is likely, then re-pipe from the
  file rather than re-fetching.
- **`./bin/icu describe` is ~56 KB — grep it for the command you need.**

## Permission tiers

The CLI refuses a command annotated destructive unless it carries `--yes`. Which commands a skill
runs is set by its tier:

| Tier                          | Runs                                                                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **Read-only**                 | `get_*`, `list_*`, `compute_*`, `compare_*`, `forecast_*`, `describe` — nothing else, and never `--yes`.                                      |
| **Build**                     | Read-only, plus `create_*`/`schedule_*`/`sync_*` (idempotent upserts, no `--yes` needed).                                                     |
| **Build**, replacing an event | Build, plus `update_event --yes` on the one event id the caller's brief names — the athlete agreed to the replacement on the coaching thread. |
| **Coaching**                  | Build, plus any other command with `--yes` once the athlete has agreed to the change in conversation (move/delete an event, and so on).       |
