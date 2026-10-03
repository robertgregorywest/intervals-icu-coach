# Each key session's outcome is computed in the digest

`get_execution_digest` reads every key session to a **Session outcome** — `landed`, `exceeded`,
`partial`, `missed` or `unverified` — with `fade` and `recursInWindow` on a partial one. The
coaching layer's `execution-review-lenses.md` shrinks from a guide to reading the payload into a
reporting policy: which outcomes reach the athlete, and how they are said.

## Why

[ADR 0010](0010-work-steps-declared-in-the-label.md) made step roles data, which made the digest
possible, but it left the lens file teaching the reader how to interpret it: discount `unclassifiedSteps`,
distrust drifted rep boundaries, read the cadence roll-up before the power verdict, treat a test's
overshoot as the test working, trust the middle band over a zone row, cite `platformCompliance` only
as context. Each was a rule a model could skip, and each is mechanical once the label says what a
step is.

Leaving them in prose also hid a contradiction. The file said a cadence miss on every rep was "one
finding about the whole session", and separately that a finding seen once is held. Read literally,
a session where no rep met its prescription was held — the opposite of what the athlete wanted
(the 6 Aug race-pace session in the `er-rp-miss-aug06` eval case). With the outcome computed, that
session is `missed`, and `missed` is reported on first sighting.

## What the digest decides

- **A work step** is `missed` (under on power by more than noise, under on cadence, or not
  attempted), `exceeded` (over on power by more than noise at its cadence), or `unjudged` (unpaired).
  A cadence miss outranks a power exceedance; a cadence ridden over its target is neither.
- **An Open-ended work step** — a test or primer, declared by a work word in
  `OPEN_ENDED_WORK_WORDS` — is never `exceeded`: its target is a floor.
- **Drifted rep boundaries** (`executionRecordNote`) make a session `unverified`, not caveated: a
  rep merged into its recovery reads as a miss that never happened.
- **`exceeded` is its own outcome**, because riding over a prescription is a progression signal the
  coach needs, not a delivery the review should stay silent on.
- **A fade** is two or more trailing missed reps with an earlier rep that landed. One light last
  rep is as likely noise as one light first rep.
- **`recursInWindow`** compares partial sessions only: a missed session misses every position and
  would make every partial one recur.

Zone rows, partition boundaries, the cadence roll-up and `platformCompliance` leave the digest's
payload; `compare_intensity_distribution` and `compare_planned_vs_actual` still return them.

## What stays judgement

Whether a `partial` miss continues an open thread in the coaching log — the threads are prose — and
what any finding should change. Issue #57 proposed a Jev Choice per session to pre-label the
disposition; with the outcome computed, the only semantic call left is that thread match, and it is
not yet worth a model of its own.
