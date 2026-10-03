# execution-review lenses

How to report `get_execution_digest` **as a coach**. Read this when a review is actually running, not at session start. The window comes from the watermark — see [coaching-log-format.md](coaching-log-format.md).

The digest has already done the reading: it judged each key session's work steps against their prescription, dropped the noise, and read each session to an `outcome`. What is left here is which outcomes reach the athlete, and how they are said. See `docs/adr/0015-session-outcome-computed-in-the-digest.md`.

## What reaches the athlete

| `outcome`    | Means                                                        | Reaches the athlete                                                                                             |
| ------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `missed`     | Every work step missed — power, cadence, or not attempted    | **Yes, on first sighting.** The session did not deliver its stimulus. Open a thread with a close condition      |
| `partial`    | Some work steps missed                                       | **Held**, unless `fade`, `recursInWindow`, or the missed rep sits where an open thread already names            |
| `exceeded`   | Nothing missed, at least one rep ridden over its target      | **Yes, as a progression signal** — name the reps and the margin, and what it suggests for the next prescription |
| `landed`     | Every work step met its prescription                         | No — it is part of the one line                                                                                 |
| `unverified` | The step lens could not be trusted (track, no laps, drifted) | At most one clause. **Never evidence the session was not ridden** — its dose is still in the band lens          |

**A `partial` session is reported when:**

- `fade` — its misses are its last two or more reps. The work ran out; say so.
- `recursInWindow` — another partial session in the window missed a rep in the same position (`workRep`). Name both sessions.
- It continues an **open thread** from the log: the missed rep sits in the structural position the thread names. This is the one call the digest cannot make. Report it as continuing that thread and say whether the thread's close condition is met.

Otherwise it is held: don't raise it, but have it ready if the athlete asks about that session.

**Silence is the default.** A window where nothing reaches the athlete gets **one line** — "the window's key sessions landed as prescribed" — plus the middle-band figure. Never a table. Never a per-session list.

## The dose

**Report the middle band every time.** `middleBand.plannedSeconds` vs `deliveredSeconds` for the window (76–106% FTP, the philosophy's primary judge of a build week), whether or not it met target. The step lens answers whether the reps were executed; the band lens answers how much of the dose landed. Both can be true at once — say which question each answered.

**Report a dose gap before planning further work.** If the delivered middle band falls materially short, say so before drafting the next block, name the likely cause from the session outcomes, and don't plan on the assumption the last block landed.

**`status: "skipped"` is not a quiet window.** It held no key session — say so, and the watermark stays where it is. Sessions in `excluded` are left out of the dose sums, not zeroes: strength sessions are expected there; an unpaired _ride_ is worth a mention, not an alarm.

## Saying it

**Frame findings as what to change, never as compliance.** This is self-coaching: the coach and the athlete who blew rep 1 are the same tired person. An audit-shaped opening reads as being marked.

**Quote the step's own figures.** `deltas.watts` is from the figure the verdict used (`verdictBasis`); `cadenceVerdict` and `deltas.cadence` say whether the cadence condition held. A rep that missed its cadence did not meet its prescription, whatever its watts.

**Reach for `compare_planned_vs_actual` on one event id** only when a reported session needs a rep's full context — labels and every step.

## Examples

- **6 Aug road race-pace, 4×2:30 at 390–410 W and 100 rpm**, ridden 88 / 85 / 82 / 80 rpm with reps 3–4 under the band → `missed`. Reported on first sighting: no rep met the cadence condition, so the session did not deliver its race-specific stimulus. What to change: the rep length or gear that lets cadence hold.
- **Sweet Spot 3×12, rep 1 light**, 94% of the middle-band dose delivered → `partial`, no fade, nothing recurring → held. It becomes a finding only if rep 1 comes in light again, at which point the conversation is about the warm-up, not compliance.
- **VO2 5×3, reps 4–5 under** → `partial` with `fade` → reported: the last reps ran out. Is the prescription a step too far, or was the session under-fuelled?
- **Threshold 2×20, both reps 6% over the band** → `exceeded` → reported as a sign the threshold targets can move up.
