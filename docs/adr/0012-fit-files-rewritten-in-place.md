# FIT files are rewritten in place, not re-encoded

Adding **Drivetrain speed** to a speedless track recording means writing a FIT file, and this repo had
only a partial, hand-rolled decoder (ADR 0006). We rewrite the file as a stream: every message is
copied byte for byte except `record` definitions (extended with `distance` and `speed`), their data
rows (given the values), and the `lap`/`session` distance and speed totals (recomputed from the same
stream), then both CRCs are recomputed. We do not decode the whole file and re-encode it with
`@garmin/fitsdk`.

## Considered options

- **Decode and re-encode with `@garmin/fitsdk`** — less bespoke byte handling, but it would be the
  repo's first runtime dependency, and a round trip keeps only what the SDK's profile knows. The Wahoo
  BOLT writes thousands of manufacturer-specific messages (global `65280` and others: 2,576 in the
  12 Jul 2026 file) plus developer fields. A re-encode that drops or reshapes them changes the
  recording in ways nobody asked for, and nobody would notice until Intervals.icu read it differently.

## Consequences

- The only difference between input and output is the speed and distance data, and a test can check
  that byte for byte, which is what makes it safe to upload the result in place of the device's file.
- Compressed-timestamp headers, big-endian definitions and developer fields have to be handled by us.
  A message type the rewriter doesn't touch needs no understanding, only its declared size.
- The FIT codec (`src/services/fit/`) knows nothing about gears. Everything about gears is in the
  Track module.
