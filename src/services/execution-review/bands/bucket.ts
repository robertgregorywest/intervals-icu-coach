import type { PlannedStep, PowerTarget } from "../../prescription/index.js";
import { bandFor } from "./zones.js";
import {
  inMiddleBand,
  type MiddleBandBounds,
} from "../../../shared/middle-band.js";
import type {
  BoundarySpanningStep,
  MiddleBandRollup,
  PartitionBand,
  UnbucketedStep,
  ZoneRow,
} from "./types.js";

/** Seconds per band name, plus the seconds that fell in the middle band. */
export interface BucketedSeconds {
  byZone: Map<ZoneRow["name"], number>;
  middleBandSeconds: number;
  totalSeconds: number;
}

export interface PlannedBuckets extends BucketedSeconds {
  unbucketed: UnbucketedStep[];
  boundarySpanning: BoundarySpanningStep[];
}

/**
 * How much of a step's prescribed time counts toward the middle band, 0–1.
 *
 * Zone assignment takes a range at its midpoint, but the middle band asks a
 * different question — not "which band is this step in" but "how much of this
 * step is inside that window" — and midpoint answers it badly. A `3600s @
 * 200–245 W` endurance block has a midpoint of 222.5 W, one and a half watts
 * inside a band that starts at 220, so midpoint credits the whole hour to the
 * band when a little over half the prescribed range sits below it. Measured
 * against real prescriptions that turned correctly-ridden Z2 sessions into
 * 79% shortfalls and dominated the window aggregate.
 *
 * A range is an acceptable spread, so the honest reading is proportional: if
 * every wattage in 200–245 is acceptable, 56% of what was accepted is in the
 * band. A point target is in or out.
 */
export function middleBandFraction(
  target: PowerTarget,
  middle: MiddleBandBounds
): number {
  if (typeof target.watts === "number") {
    return inMiddleBand(target.watts, middle) ? 1 : 0;
  }

  const { low, high } = target;
  if (typeof low !== "number" || typeof high !== "number") return 0;
  if (high <= low) return inMiddleBand(low, middle) ? 1 : 0;

  const overlap = Math.min(high, middle.highW) - Math.max(low, middle.lowW);
  return overlap <= 0 ? 0 : overlap / (high - low);
}

/**
 * Bucket the prescription. Each step contributes its whole prescribed duration
 * at its prescribed absolute power — the workout as written, not the platform's
 * rendering of it at authoring time.
 *
 * A range is bucketed at the step's **midpoint**, matching how `session-review`
 * judges a progression — so a step that lens scores against 265 W is bucketed
 * here at 265 W too, and the two lenses stay coherent. The athlete prescribes
 * ranges as acceptable spreads rather than as progressions to be traversed, so
 * spreading the seconds across the bands a range touches would invent a
 * time-at-intensity pattern the prescription never asked for.
 */
export function bucketPlanned(
  steps: PlannedStep[],
  partition: PartitionBand[],
  middle: MiddleBandBounds | undefined
): PlannedBuckets {
  const byZone = new Map<ZoneRow["name"], number>();
  const unbucketed: UnbucketedStep[] = [];
  const boundarySpanning: BoundarySpanningStep[] = [];
  let middleBandSeconds = 0;
  let totalSeconds = 0;

  for (const step of steps) {
    const seconds = step.durationSeconds;
    if (!seconds || seconds <= 0) continue;

    const watts = step.target ? step.midpointWatts : undefined;
    if (watts === undefined) {
      // Never assigned by guesswork: a step with no resolvable target leaves the
      // distribution rather than landing somewhere plausible.
      unbucketed.push({
        index: step.index,
        label: step.label,
        durationSeconds: seconds,
        reason:
          step.targetUnresolved ?? "step prescribes no power target to bucket",
      });
      continue;
    }

    totalSeconds += seconds;

    const band = bandFor(partition, watts);
    if (band) {
      byZone.set(band.name, (byZone.get(band.name) ?? 0) + seconds);

      const { low, high } = step.target!;
      if (typeof low === "number" && typeof high === "number") {
        const lowBand = bandFor(partition, low);
        const highBand = bandFor(partition, high);
        if (lowBand?.name !== highBand?.name) {
          boundarySpanning.push({
            index: step.index,
            label: step.label,
            lowW: low,
            highW: high,
            assignedZone: band.name,
            midpointW: watts,
          });
        }
      }
    }

    if (middle) {
      middleBandSeconds += seconds * middleBandFraction(step.target!, middle);
    }
  }

  return {
    byZone,
    // Proportional shares leave fractions of a second, which mean nothing at
    // this resolution and read badly beside the delivered whole-second counts.
    middleBandSeconds: Math.round(middleBandSeconds),
    totalSeconds,
    unbucketed,
    boundarySpanning,
  };
}

/**
 * Bucket the recorded power.
 *
 * Each sample counts as one second. The stream is 1 Hz over *recording* time,
 * with pauses simply absent from it, so the seconds sum to recording time and
 * not to elapsed time. Crediting a pause's duration to the wattage either side
 * of it would invent time at an intensity that was not ridden, which is the
 * failure this comparison exists to catch.
 */
export function bucketDelivered(
  watts: readonly (number | null | undefined)[],
  partition: PartitionBand[],
  middle: MiddleBandBounds | undefined
): BucketedSeconds {
  const byZone = new Map<ZoneRow["name"], number>();
  let middleBandSeconds = 0;
  let totalSeconds = 0;

  for (const sample of watts) {
    if (typeof sample !== "number" || !Number.isFinite(sample)) continue;
    totalSeconds += 1;

    const band = bandFor(partition, sample);
    if (band) byZone.set(band.name, (byZone.get(band.name) ?? 0) + 1);

    if (middle && inMiddleBand(sample, middle)) {
      middleBandSeconds += 1;
    }
  }

  return { byZone, middleBandSeconds, totalSeconds };
}

/**
 * The middle-band roll-up, built from the two sides' own middle-band tallies
 * rather than by summing bands — the window is a percentage of FTP and the
 * bands are anchored on MAP, so neither is a roll-up of the other.
 */
export function rollUpMiddleBand(
  bounds: MiddleBandBounds,
  lowPctFtp: number,
  highPctFtp: number,
  plannedSeconds: number,
  deliveredSeconds: number
): MiddleBandRollup {
  return {
    lowW: bounds.lowW,
    highW: bounds.highW,
    lowPctFtp,
    highPctFtp,
    plannedSeconds,
    deliveredSeconds,
    deltaSeconds: deliveredSeconds - plannedSeconds,
    // Nothing prescribed in the band makes the fraction a division by zero, not
    // a perfect score.
    deliveredFraction:
      plannedSeconds > 0 ? deliveredSeconds / plannedSeconds : undefined,
  };
}
