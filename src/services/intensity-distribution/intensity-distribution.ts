import type { IActivitiesApi } from "../activities/index.js";
import type { IEventsApi } from "../events/index.js";
import type { Activity } from "../activities/types.js";
import type { IntervalsEvent } from "../../types.js";
import { readPrescription } from "../prescription/index.js";
import { planFtp } from "../athlete-anchors/index.js";
import {
  createPairedSessionLoader,
  MAX_WINDOW_DAYS,
  type LoadedWindow,
  type PairedSession,
  type PairedSessionLoader,
} from "../paired-sessions/index.js";
import {
  bucketDelivered,
  bucketPlanned,
  rollUpMiddleBand,
  type MiddleBandBounds,
} from "./bucket.js";
import {
  MIDDLE_BAND_HIGH_PCT_FTP,
  MIDDLE_BAND_LOW_PCT_FTP,
  derivePartition,
  middleBandBounds,
} from "./zones.js";
import type {
  CompareIntensityDistributionOptions,
  CompareIntensityDistributionRangeOptions,
  DistributionReason,
  ExcludedSession,
  IIntensityDistribution,
  IntensityDistributionRangeResult,
  IntensityDistributionResult,
  PartitionBand,
  RangeSessionRow,
  ZoneComparisonRow,
  ZoneRow,
} from "./types.js";

/** Longest range the aggregate will span — the **Review window**'s cap. */
export const MAX_RANGE_DAYS = MAX_WINDOW_DAYS;

export interface CoachingZones {
  zones: ZoneRow[] | null;
  ftp: number | null;
}

export interface IntensityDistributionDeps {
  activitiesApi: IActivitiesApi;
  eventsApi: IEventsApi;
  /**
   * The athlete's coaching frame. Injected rather than composed so the service
   * can be tested against a pinned frame — the athlete's MAP moves, and a test
   * whose expected seconds move with it is testing nothing.
   */
  getCoachingZones(): Promise<CoachingZones>;
}

export class IntensityDistribution implements IIntensityDistribution {
  private loader: PairedSessionLoader;

  constructor(private deps: IntensityDistributionDeps) {
    this.loader = createPairedSessionLoader(deps);
  }

  async compareIntensityDistribution(
    options: CompareIntensityDistributionOptions
  ): Promise<IntensityDistributionResult> {
    // Throws on both-or-neither, before any HTTP.
    const found = await this.loader.find(options);

    if (!found.session) {
      return refuse(found.activity, found.event, found.reason, found.message);
    }

    const frame = await distributionFrame(this.deps.getCoachingZones);
    return distributeSession(found.session, frame);
  }

  async compareIntensityDistributionRange(
    options: CompareIntensityDistributionRangeOptions
  ): Promise<IntensityDistributionRangeResult> {
    // Throws on a window over the cap, before any HTTP.
    const loaded = await this.loader.loadWindow(options);
    const frame = await distributionFrame(this.deps.getCoachingZones);
    return distributeWindow(loaded, frame);
  }
}

/** The bucketing frame, resolved once per call rather than per session. */
export async function distributionFrame(
  getCoachingZones: () => Promise<CoachingZones>
): Promise<DistributionFrame> {
  const { zones, ftp } = await getCoachingZones();
  return {
    partition: zones ? derivePartition(zones) : [],
    middle: ftp && ftp > 0 ? middleBandBounds(ftp) : undefined,
    athleteFtp: ftp,
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
  const ftp = await planFtp(event, activity, async () => frame.athleteFtp);
  const planned = readPrescription(event.workout_doc, { ftp }).steps;

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
  /** The last resort for a session whose event and ride both lack an FTP. */
  athleteFtp: number | null;
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

export function createIntensityDistribution(
  deps: IntensityDistributionDeps
): IntensityDistribution {
  return new IntensityDistribution(deps);
}
