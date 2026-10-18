# coaching-log format

Maintenance procedure for `docs/personal/coaching-log.md` — the session-by-session tier at the bottom of the four-tier coaching-context stack: the `coaching-philosophy` skill (timeless, tracked) → `docs/personal/steering.md` (personal overrides) → `season.md` (between-blocks) → this log (session-by-session). Read this at a logging checkpoint, before writing.

## File structure

Two sections, header first:

```
## Current state / open threads
reviewed-through: YYYY-MM-DD
- <thread> — <open-condition> (since YYYY-MM-DD)
...

---

## Log
### YYYY-MM-DD — <block>
- Decided: <call> — <rationale>   →[open: <thread-id>]
- Signal: <subjective context>     →[open: <thread-id>]
- <other loggable item>
...
```

- **Header** = live state only. Each thread names the condition that keeps it open. Read in full every session.
- **`reviewed-through`** = the execution-review watermark: the date through which delivered sessions have already been reviewed. One line, first in the header, before the thread list. Absent on an existing log written before this line existed, and on a freshly bootstrapped one — see _Review window_ below for what happens then.
- **Log** = dated entries, newest first. Rolling 12-week window of detail.
- `→[open: id]` tags a line whose state must survive in the header after the entry ages out.

## Writing an entry

1. Heading: today's date + the current block, computed from `season.md`'s macro table + today's date (fuzzy is fine — e.g. "Re-build").
2. One bullet per loggable item — apply the re-derivability test (see `SKILL.md`): log only what a future session couldn't re-derive from the `coaching-philosophy` skill, `steering.md`, `season.md`, `get_coaching_context`, or Intervals.icu data. Tag any line that opens or updates a live thread. A line that argues from a session's conditions — venue, indoors or out, bike, suit, gear, solo or paced — cites the activity ID (`i173176564`, not "the 6 Aug session"), and a thread is restated from that activity, never from its own last version: a rewrite of a rewrite drifts from ground truth while looking faithful.
3. Mirror new or changed threads into the header with an open-condition.

## The log records conclusions, not the conversation

The re-derivability test in `SKILL.md` screens against **data** — it asks whether a source could
reconstruct the line. It does not screen against **conversation**, and that is the gap through which
entries bloat: a correction made twenty minutes ago is not re-derivable from anything, so it passes,
yet it is worthless to a future reader. Apply a second screen to every line:

> **Reader test — would this mean anything to someone who was not in the session?**
> If it only makes sense as a record of how the discussion moved, cut it.

**Never log:**

- **Corrections, retractions, and superseded claims.** Fix the wrong thing where it lives and log the
  corrected fact only. Restating a retracted claim in order to retract it puts the wrong number back
  in front of the next reader — the opposite of the intent.
- **Attribution of who said what** — "athlete-raised", "I over-claimed", "challenged in session".
  The decision stands on its merits, and the log is not a transcript.
- **Process-compliance narration** — "flagged rather than silently shipped", "deliberate deviation,
  not an oversight". Doing the right thing is the baseline, not a finding.
- **Emphasis arguing with an objection already settled** — "this is the finding", "what is NOT
  defensible". Assert once, plainly. Bold used for contrast against a position nobody holds is noise.
- **Anything already written into a durable file.** If the fact now lives in `steering.md`,
  `track-context.md`, `season.md`, or the philosophy skill, the entry gets a **pointer**, never a
  copy. Duplicated facts drift, and then two files disagree.
- **Figures a tool returns on demand** — weekly TSS, projected CTL, per-session load. Log the
  _decision_ those numbers drove, not the numbers.

**Shape.** One line per item, one sentence where possible. An entry is a handful of lines: if it
reads like minutes, it is minutes. Prefer `Decided: X — because Y` and `Signal: X`, and let the
header thread carry any state that must survive.

## At every checkpoint write — maintain

1. **Compact** — for entries older than 12 weeks: promote any still-live thread into the header (if not already there), then drop the dated detail.
2. **Review the header** — for each thread, test its open-condition against this session. Resolved or lapsed → retire it (remove from header, add a closing line to today's entry). Ambiguous → ask before retiring; never drop a live thread silently.
3. **Advance the watermark** — set `reviewed-through` to the `reviewedThrough` date `get_execution_digest` returned (today, in practice) as part of this write. Only as part of a confirmed write, never before: if the athlete doesn't confirm, the line stays where it was and the next session re-reviews the same window rather than silently skipping it. Advance it whenever a review ran, including when the review found nothing worth reporting — a quiet window is still a reviewed one.
4. **Promote durable facts out** — a fact that outlives this session's execution-state (a race result, a confirmed benchmark, a lasting pattern, a training belief, a measurement method) moves to its home per [context-files.md](context-files.md), and the log line becomes a pointer. Compaction must never let a durable fact age out with nowhere to land.
5. **Commit** — `docs/personal/` is its own private git repo (the public repo ignores the path), so an uncommitted write lives on one machine only. Close the checkpoint with:

   ```
   cd <repo root>/docs/personal && \
     git add -A && git commit -m "coaching: <entry date> — <block>" && git push
   ```

   One commit carries everything the checkpoint touched — a fact promoted to `season.md` or `steering.md` in step 4 goes in it, not left behind as a loose edit.

## Review window

The window `get_execution_digest` sweeps at session start. Derived from the watermark, never from "the last few days":

| Watermark state                                    | Window                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Present                                            | `reviewed-through` → today                                                                           |
| Absent (pre-existing log, or freshly bootstrapped) | The current block from `season.md`, capped at 28 days                                                |
| Older than 28 days                                 | The most recent 28 days. **Say so** — state plainly that sessions before that date were not reviewed |
| Less than a day                                    | Skip the review without invoking the skill. Leave the watermark unchanged                            |
| The window holds no key session                    | The skill reports it skipped (only it sees the planned events). Leave the watermark unchanged        |

The 28-day ceiling matches the 3–4 week block cadence in the philosophy: a longer window stops describing one block. The floor stops a second conversation on the same day re-reviewing what the first one already covered.

## Bootstrap

If `coaching-log.md` doesn't exist, create it on the first write with the two section headers and an empty header list. A bootstrapped log has no `reviewed-through` line until its first confirmed write that follows a review.
