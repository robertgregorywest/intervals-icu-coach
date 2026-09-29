import type { Activity } from "../../activities/index.js";
import type { IntervalsEvent } from "../../../types.js";
import type { IPrescription } from "../../prescription/index.js";
import type { IAthleteAnchors } from "../../athlete-anchors/index.js";
import type { LoadedWindow, PairedSession, Unpaired } from "../paired/types.js";
import { bucketDelivered, bucketPlanned, rollUpMiddleBand } from "./bucket.js";
import { derivePartition } from "./zones.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
  middleBandBounds,
  type MiddleBandBounds,
} from "../../../shared/middle-band.js";
import type {
  DistributionReason,
  ExcludedSession,
  IntensityDistributionRangeResult,
  IntensityDistributionResult,
  PartitionBand,
  RangeSessionRow,
  ZoneComparisonRow,
  ZoneRow,
} from "./types.js";

/**
 * The bucketing frame, resolved once per call rather than per session. Pass a
 * snapshot, so each session's plan FTP falls back on the athlete read here.
 */
export async function distributionFrame(
  anchors: IAthleteAnchors,
  prescription: IPrescription
): Promise<DistributionFrame> {
  const [{ mapZones }, { ftp }] = await Promise.all([
    anchors.getMapAnchors(),
    anchors.getAthleteAnchors(),
  ]);
  return {
    partition: mapZones ? derivePartition(mapZones) : [],
    middle: ftp && ftp > 0 ? middleBandBounds(ftp) : undefined,
    anchors,
    prescription,
  };
}

/**
 * The band lens over a loaded window: every paired session bucketed and summed.
 * Unpaired rides and unridden plans are excluded and named — neither has the
 * other half to have been delivered against.
 */
export async function distributeWindow(
  loaded: LoadedWindow,
  frame: DistributionFrame
): Promise<IntensityDistributionRangeResult> {
  const { oldest, newest } = loaded.window;
  const results = await Promise.all(
    loaded.sessions.map((session) => distributeSession(session, frame))
  );

  const plannedByZone = new Map<ZoneRow["name"], number>();
  const deliveredByZone = new Map<ZoneRow["name"], number>();
  let middlePlanned = 0;
  let middleDelivered = 0;
  const sessions: RangeSessionRow[] = [];
  const excluded: ExcludedSession[] = [];

  for (const result of results) {
    if (result.reason || !result.middleBand) {
      excluded.push({
        date: result.date,
        activityId: result.activityId,
        eventId: result.eventId,
        name: result.activityName ?? result.eventName,
        reason: result.reason ?? "no-coaching-zones",
        message: result.message ?? "No comparison could be computed.",
      });
      continue;
    }

    for (const row of result.zones ?? []) {
      plannedByZone.set(
        row.zone,
        (plannedByZone.get(row.zone) ?? 0) + row.plannedSeconds
      );
      deliveredByZone.set(
        row.zone,
        (deliveredByZone.get(row.zone) ?? 0) + row.deliveredSeconds
      );
    }
    middlePlanned += result.middleBand.plannedSeconds;
    middleDelivered += result.middleBand.deliveredSeconds;

    sessions.push({
      date: result.date,
      activityId: result.activityId,
      eventId: result.eventId,
      name: result.activityName ?? result.eventName,
      middleBandPlannedSeconds: result.middleBand.plannedSeconds,
      middleBandDeliveredSeconds: result.middleBand.deliveredSeconds,
      middleBandDeliveredFraction: result.middleBand.deliveredFraction,
    });
  }

  // Unpaired work neither inflates nor deflates the aggregate, and a session
  // prescribed and not delivered is not one the sums may absorb.
  for (const half of [...loaded.unpairedRides, ...loaded.unriddenEvents]) {
    const { activity, event } = half;
    excluded.push({
      date: activity?.start_date_local ?? event?.start_date_local,
      ...(activity ? { activityId: activity.id } : { eventId: event?.id }),
      name: activity?.name ?? event?.name,
      reason: half.reason,
      message: half.message,
    });
  }

  return {
    oldest,
    newest,
    boundaries: frame.partition,
    zones: frame.partition.length
      ? toRows(frame.partition, plannedByZone, deliveredByZone)
      : undefined,
    middleBand: frame.middle
      ? rollUpMiddleBand(
          frame.middle,
          MIDDLE_BAND_LOW_PCT_FTP,
          MIDDLE_BAND_HIGH_PCT_FTP,
          middlePlanned,
          middleDelivered
        )
      : undefined,
    sessions,
    excluded,
  };
}

/**
 * The band lens over one loaded session: planned steps and the recorded power
 * stream bucketed against the same frame.
 */
export async function distributeSession(
  session: PairedSession,
  frame: DistributionFrame
): Promise<IntensityDistributionResult> {
  const { activity, event } = session;
  const ftp = await frame.anchors.planFtp(event, activity);
  const planned = frame.prescription.read(event.workout_doc, { ftp }).steps;

  if (planned.length === 0) {
    return refuse(
      activity,
      event,
      "no-structured-steps",
      `Planned event ${event.id} carries no structured workout steps, so there ` +
        "is no prescribed distribution to compare the ride against."
    );
  }

  const { watts } = await session.streams();

  if (!watts?.length) {
    return refuse(
      activity,
      event,
      "no-recorded-power",
      `Activity ${activity.id} has no recorded power, so what was delivered ` +
        "cannot be bucketed. Duration alone is not a substitute for intensity."
    );
  }

  const plannedBuckets = bucketPlanned(planned, frame.partition, frame.middle);
  const deliveredBuckets = bucketDelivered(
    watts,
    frame.partition,
    frame.middle
  );

  const base = {
    activityId: activity.id,
    eventId: event.id,
    activityName: activity.name,
    eventName: event.name,
    date: activity.start_date_local,
    plannedTotalSeconds: plannedBuckets.totalSeconds,
    deliveredTotalSeconds: deliveredBuckets.totalSeconds,
    unbucketedSteps: plannedBuckets.unbucketed,
    boundarySpanningSteps: plannedBuckets.boundarySpanning,
  };

  // The middle band survives a missing zone frame: its bounds come from FTP,
  // not from the zones, so losing one does not cost the other.
  const middleBand = frame.middle
    ? rollUpMiddleBand(
        frame.middle,
        MIDDLE_BAND_LOW_PCT_FTP,
        MIDDLE_BAND_HIGH_PCT_FTP,
        plannedBuckets.middleBandSeconds,
        deliveredBuckets.middleBandSeconds
      )
    : undefined;

  if (frame.partition.length === 0) {
    return {
      ...base,
      middleBand,
      reason: "no-coaching-zones",
      message:
        "The athlete's coaching zones could not be resolved, so there is no " +
        "frame to bucket into. The middle band is reported regardless, its " +
        "bounds being a percentage of FTP rather than of the zone model.",
    };
  }

  return {
    ...base,
    boundaries: frame.partition,
    zones: toRows(
      frame.partition,
      plannedBuckets.byZone,
      deliveredBuckets.byZone
    ),
    middleBand,
  };
}

export interface DistributionFrame {
  partition: PartitionBand[];
  middle?: MiddleBandBounds;
  /** Resolves each session's plan FTP, the athlete's as the last resort. */
  anchors: IAthleteAnchors;
  /** Reads each session's plan into the steps that are bucketed. */
  prescription: IPrescription;
}

function toRows(
  partition: PartitionBand[],
  planned: Map<ZoneRow["name"], number>,
  delivered: Map<ZoneRow["name"], number>
): ZoneComparisonRow[] {
  return partition.map((band) => {
    const plannedSeconds = planned.get(band.name) ?? 0;
    const deliveredSeconds = delivered.get(band.name) ?? 0;
    return {
      zone: band.name,
      lowW: band.lowW,
      highW: band.highW,
      plannedSeconds,
      deliveredSeconds,
      deltaSeconds: deliveredSeconds - plannedSeconds,
    };
  });
}

/** A half-session distributed: no breakdown, and the named reason. */
export function unpairedDistribution(
  found: Unpaired
): IntensityDistributionResult {
  return refuse(found.activity, found.event, found.reason, found.message);
}

/**
 * Every dead end returns the same shape with a named reason — never a
 * distribution of zeroes, which would read as "nothing was ridden at any
 * intensity" rather than "this could not be computed".
 */
function refuse(
  activity: Activity | undefined,
  event: IntervalsEvent | undefined,
  reason: DistributionReason,
  message: string
): IntensityDistributionResult {
  return {
    activityId: activity?.id,
    eventId: event?.id,
    activityName: activity?.name,
    eventName: event?.name,
    date: activity?.start_date_local ?? event?.start_date_local,
    plannedTotalSeconds: 0,
    deliveredTotalSeconds: 0,
    unbucketedSteps: [],
    boundarySpanningSteps: [],
    reason,
    message,
  };
}
