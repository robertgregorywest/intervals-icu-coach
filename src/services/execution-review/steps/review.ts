import { alignSteps } from "./align.js";
import {
  ROLLING_WINDOW_SECONDS,
  normalizedPower,
} from "../../analysis/index.js";
import type {
  ActivityInterval,
  AlignedStep,
  CadenceVerdict,
  DeliveredInterval,
  PlannedStep,
  PlannedVsActualResult,
  PowerTarget,
  SessionRollup,
  StepVerdict,
  UnplannedInterval,
  VerdictBasis,
} from "./types.js";
import { round } from "../../../round.js";

export const DEFAULT_TOLERANCE = 0.05;

/**
 * A band step prescribed longer than this is judged on normalized power
 * instead of average power. Below it (and for point targets and ramps at any
 * duration) average power stays the judge: short reps are ridden on a
 * repeatable stretch of road and stay clean regardless of band width, and a
 * fixed-watt step is an instrument whose intent normalized power would hide.
 * See issue #16.
 */
export const NP_VERDICT_MIN_DURATION_SECONDS = 300;

/** A raw 1 Hz-ish power recording: parallel `time` (elapsed seconds, gaps on
 * auto-pause) and `watts` arrays, straight off the activity's stream. */
export interface RawPowerStream {
  time: number[];
  watts: Array<number | null>;
}

/**
 * The samples covering one step's window, located by elapsed time rather than
 * by array offset — a stream gap (auto-pause) shifts every later sample's
 * offset away from its elapsed second, so offset and elapsed time are not
 * interchangeable. Null samples are excluded rather than treated as zero.
 */
export function sliceStepWindow(
  stream: RawPowerStream,
  startTime: number,
  durationSeconds: number
): number[] | undefined {
  const { time, watts } = stream;
  if (time.length === 0 || time.length !== watts.length) return undefined;

  const endTime = startTime + durationSeconds;
  let startIndex = -1;
  let endIndex = time.length;
  for (let i = 0; i < time.length; i++) {
    if (startIndex === -1 && time[i] >= startTime) startIndex = i;
    if (time[i] >= endTime) {
      endIndex = i;
      break;
    }
  }
  if (startIndex === -1 || startIndex >= endIndex) return undefined;

  const window = watts
    .slice(startIndex, endIndex)
    .filter((w): w is number => typeof w === "number");
  return window.length > 0 ? window : undefined;
}

function coastingFraction(window: number[]): number {
  return window.filter((w) => w === 0).length / window.length;
}

/** Whether a step's target/duration calls for a normalized-power verdict. */
function wantsNormalizedPower(planned: PlannedStep): boolean {
  const target = planned.target;
  return (
    !!target &&
    target.low !== undefined &&
    target.high !== undefined &&
    !target.ramp &&
    !!planned.durationSeconds &&
    planned.durationSeconds > NP_VERDICT_MIN_DURATION_SECONDS
  );
}

/**
 * A step delivering less than this fraction of its prescribed time is reported
 * as `not-attempted` rather than judged on power: the average wattage of 20
 * seconds of a prescribed 5-minute effort says nothing useful.
 *
 * Deliberately separate from `tolerance`. Loosening how strictly power is
 * judged must not change what counts as an abandoned step.
 */
export const NOT_ATTEMPTED_DURATION_FRACTION = 0.5;

/**
 * How far a step's average cadence may sit from a point cadence target and
 * still be `on-target`. Fixed rpm rather than a fraction: cadence lives in a
 * narrow absolute range, and 5 rpm either side of 100 is the same miss as
 * either side of 80. A cadence band carries no tolerance, as with power.
 */
export const CADENCE_TOLERANCE_RPM = 5;

/** Reduce raw intervals to the fields the comparison reads. */
export function toDeliveredIntervals(
  intervals: ActivityInterval[]
): DeliveredInterval[] {
  return (intervals ?? [])
    .map((iv, index) => ({
      index,
      type: typeof iv.type === "string" ? iv.type : undefined,
      label: typeof iv.label === "string" ? iv.label : undefined,
      startTime: numberOrUndefined(iv.start_time),
      durationSeconds: numberOrUndefined(iv.elapsed_time) ?? 0,
      averageWatts: positiveOrUndefined(iv.average_watts),
      averageCadence: positiveOrUndefined(iv.average_cadence),
      averageHeartrate: positiveOrUndefined(iv.average_heartrate),
    }))
    .filter((iv) => iv.durationSeconds > 0);
}

function numberOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function positiveOrUndefined(v: unknown): number | undefined {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? v : undefined;
}

/**
 * Judge one paired step. Duration is checked before power, so an abandoned step
 * is never dressed up as a power miss. `verdictBasis` reflects which power
 * figure the target/duration call for even on a path that never reaches a
 * power comparison, so a caller always knows what the rule would have judged.
 */
export function judgeStep(
  planned: PlannedStep,
  delivered: DeliveredInterval,
  tolerance: number,
  normalizedWatts?: number
): {
  verdict: StepVerdict;
  watts?: number;
  wattsFraction?: number;
  note?: string;
  verdictBasis: VerdictBasis;
} {
  const basisWanted: VerdictBasis = wantsNormalizedPower(planned)
    ? "normalized-power"
    : "average-watts";

  const prescribed = planned.durationSeconds;
  if (
    prescribed &&
    delivered.durationSeconds < prescribed * NOT_ATTEMPTED_DURATION_FRACTION
  ) {
    return { verdict: "not-attempted", verdictBasis: basisWanted };
  }

  if (planned.targetUnresolved) {
    return {
      verdict: "unmatched",
      note: planned.targetUnresolved,
      verdictBasis: basisWanted,
    };
  }
  if (!planned.target) {
    return {
      verdict: "unmatched",
      note: "planned step has no power target",
      verdictBasis: basisWanted,
    };
  }

  let basis: VerdictBasis = basisWanted;
  let actual: number | undefined;
  if (basis === "normalized-power") {
    if (normalizedWatts !== undefined) {
      actual = normalizedWatts;
    } else {
      basis = "normalized-power-fallback";
      actual = delivered.averageWatts;
    }
  } else {
    actual = delivered.averageWatts;
  }

  if (actual === undefined) {
    return {
      verdict: "unmatched",
      note: "no power recorded for this interval",
      verdictBasis: basis,
    };
  }

  const { verdict, delta, reference } = compareToTarget(
    planned.target,
    planned.midpointWatts,
    actual,
    tolerance
  );

  return {
    verdict,
    watts: delta,
    wattsFraction: reference ? round(delta / reference, 4) : undefined,
    verdictBasis: basis,
  };
}

/**
 * Judge a step's delivered average cadence against its planned cadence.
 * Returns nothing when the step prescribes no cadence, recorded none, or was
 * not attempted — an abandoned step is not judged on cadence either. A band is
 * satisfied anywhere inside it; outside, the delta is from the crossed edge.
 */
export function judgeCadence(
  planned: PlannedStep,
  delivered: DeliveredInterval
): { verdict: CadenceVerdict; delta: number } | undefined {
  const actual = delivered.averageCadence;
  if (actual === undefined) return undefined;
  const prescribed = planned.durationSeconds;
  if (
    prescribed &&
    delivered.durationSeconds < prescribed * NOT_ATTEMPTED_DURATION_FRACTION
  ) {
    return undefined;
  }

  const range = planned.cadenceRange;
  if (range) {
    if (actual > range.high) {
      return { verdict: "over", delta: Math.round(actual - range.high) };
    }
    if (actual < range.low) {
      return { verdict: "under", delta: Math.round(actual - range.low) };
    }
    return { verdict: "on-target", delta: 0 };
  }

  if (!planned.cadence || planned.cadence <= 0) return undefined;
  const delta = Math.round(actual - planned.cadence);
  if (Math.abs(actual - planned.cadence) <= CADENCE_TOLERANCE_RPM) {
    return { verdict: "on-target", delta };
  }
  return { verdict: delta > 0 ? "over" : "under", delta };
}

/**
 * A band target is satisfied anywhere inside the band — a deliberately wide Z2
 * range is not a near-miss against its own midpoint. Outside the band, the
 * delta is measured from the edge that was crossed.
 *
 * `tolerance` governs point targets only. A band already states the spread the
 * coach will accept, and widening it by a further 5% would dilute the athlete's
 * own intent: a 244 W rep against a prescribed 255-275 W block is a real
 * under-delivery, and reporting it on-target hides the rep-to-rep decay this
 * comparison exists to surface.
 */
function compareToTarget(
  target: PowerTarget,
  midpointWatts: number | undefined,
  actual: number,
  tolerance: number
): { verdict: StepVerdict; delta: number; reference?: number } {
  if (target.low !== undefined && target.high !== undefined) {
    // A ramp's ends are not an acceptable range: riding the whole step at the
    // bottom of a 130->220 W ramp is "in range" but is not what was asked for.
    // Judge it against the midpoint, which is the average the ramp prescribes.
    if (target.ramp) {
      return comparePoint(midpointWatts!, actual, tolerance);
    }
    if (actual >= target.low && actual <= target.high) {
      return { verdict: "on-target", delta: 0, reference: target.high };
    }
    if (actual > target.high) {
      return {
        verdict: "over",
        delta: actual - target.high,
        reference: target.high,
      };
    }
    return {
      verdict: "under",
      delta: actual - target.low,
      reference: target.low,
    };
  }

  return comparePoint(target.watts ?? 0, actual, tolerance);
}

function comparePoint(
  point: number,
  actual: number,
  tolerance: number
): { verdict: StepVerdict; delta: number; reference?: number } {
  const delta = Math.round(actual - point);
  if (point <= 0) return { verdict: "unmatched", delta };
  const fraction = (actual - point) / point;
  if (Math.abs(fraction) <= tolerance) {
    return { verdict: "on-target", delta, reference: point };
  }
  return {
    verdict: fraction > 0 ? "over" : "under",
    delta,
    reference: point,
  };
}

export interface ReviewInputs {
  planned: PlannedStep[];
  intervals: DeliveredInterval[];
  tolerance: number;
  plannedLoad?: number;
  actualLoad?: number;
  plannedDurationSeconds?: number;
  actualDurationSeconds?: number;
  platformCompliance?: number;
  /** The activity's raw power recording. Absent when it could not be fetched. */
  powerStream?: RawPowerStream;
}

/**
 * The pure core: align, judge, and roll up. Takes no client and performs no I/O
 * so it can be exercised directly against fixture pairs.
 */
export function reviewSession(
  inputs: ReviewInputs
): Pick<
  PlannedVsActualResult,
  | "alignmentBasis"
  | "matchedFraction"
  | "steps"
  | "rollup"
  | "reason"
  | "message"
> {
  const { planned, intervals, tolerance } = inputs;
  const alignment = alignSteps(planned, intervals);

  const byPlanned = new Map(
    alignment.pairs.map((p) => [p.plannedIndex, p.intervalIndex])
  );
  const intervalByIndex = new Map(intervals.map((iv) => [iv.index, iv]));

  const steps: AlignedStep[] = planned.map((step) => {
    const base: AlignedStep = {
      index: step.index,
      label: step.label,
      repIndex: step.repIndex,
      repCount: step.repCount,
      stepInRep: step.stepInRep,
      planned: {
        durationSeconds: step.durationSeconds,
        target: step.target,
        cadence: step.cadence,
        cadenceRange: step.cadenceRange,
      },
      verdict: "unmatched",
      verdictBasis: wantsNormalizedPower(step)
        ? "normalized-power"
        : "average-watts",
    };

    const intervalIndex = byPlanned.get(step.index);
    const delivered =
      intervalIndex === undefined
        ? undefined
        : intervalByIndex.get(intervalIndex);

    if (!delivered) {
      return {
        ...base,
        note: alignment.ambiguous.includes(step.index)
          ? "more than one recorded interval fits this step equally well"
          : "no recorded interval could be matched to this step",
      };
    }

    const window =
      inputs.powerStream && delivered.startTime !== undefined
        ? sliceStepWindow(
            inputs.powerStream,
            delivered.startTime,
            delivered.durationSeconds
          )
        : undefined;
    const normalizedWatts =
      window && window.length >= ROLLING_WINDOW_SECONDS
        ? Math.round(normalizedPower(window)!)
        : undefined;

    const judged = judgeStep(step, delivered, tolerance, normalizedWatts);
    const cadence = judgeCadence(step, delivered);

    return {
      ...base,
      delivered: {
        intervalIndex: delivered.index,
        durationSeconds: delivered.durationSeconds,
        averageWatts: delivered.averageWatts,
        averageCadence: delivered.averageCadence,
        averageHeartrate: delivered.averageHeartrate,
        normalizedWatts,
        coastingFraction: window ? coastingFraction(window) : undefined,
      },
      deltas: {
        durationSeconds:
          step.durationSeconds === undefined
            ? undefined
            : delivered.durationSeconds - step.durationSeconds,
        watts: judged.watts,
        wattsFraction: judged.wattsFraction,
        cadence: cadence?.delta,
      },
      verdict: judged.verdict,
      verdictBasis: judged.verdictBasis,
      cadenceVerdict: cadence?.verdict,
      note: judged.note,
    };
  });

  const matchedIntervals = new Set(alignment.pairs.map((p) => p.intervalIndex));
  const unplannedIntervals: UnplannedInterval[] = intervals
    .filter((iv) => !matchedIntervals.has(iv.index))
    .map((iv) => ({
      intervalIndex: iv.index,
      type: iv.type,
      durationSeconds: iv.durationSeconds,
      averageWatts: iv.averageWatts,
    }));

  const rollup: SessionRollup = {
    plannedLoad: inputs.plannedLoad,
    actualLoad: inputs.actualLoad,
    plannedDurationSeconds: inputs.plannedDurationSeconds,
    actualDurationSeconds: inputs.actualDurationSeconds,
    platformCompliance: inputs.platformCompliance,
    unplannedIntervals,
  };

  // On `none` the step list is empty rather than a wall of `unmatched` rows:
  // the roll-up still answers the coarse question, and the reason says why the
  // fine one could not be answered.
  if (alignment.basis === "none") {
    return {
      alignmentBasis: "none",
      matchedFraction: alignment.matchedFraction,
      steps: [],
      rollup,
      reason: "alignment-failed",
      message:
        `Could not align ${planned.length} planned step(s) to ` +
        `${intervals.length} recorded interval(s) with confidence. ` +
        "Reporting no step-level comparison rather than a pairing that may be wrong.",
    };
  }

  return {
    alignmentBasis: alignment.basis,
    matchedFraction: alignment.matchedFraction,
    steps,
    rollup,
  };
}
