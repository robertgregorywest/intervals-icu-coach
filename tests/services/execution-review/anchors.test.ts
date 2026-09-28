import { describe, it, expect } from "vitest";
import { createPrescription } from "../../../src/services/prescription/index.js";
import { createExecutionReview } from "../../../src/services/execution-review/index.js";
import { pinnedAnchors } from "../../helpers/anchors.js";
import type {
  Activity,
  FitLap,
  IActivitiesApi,
} from "../../../src/services/activities/index.js";
import type { IEventsApi } from "../../../src/services/events/index.js";
import type { IntervalsEvent, PlannedDocStep } from "../../../src/types.js";
import { createWorkoutParser } from "../../../src/services/workout-parser/index.js";

/**
 * The three lenses read one planned event, whose percentages must resolve
 * against the same FTP in each: the digest selects a session on its planned
 * steps, the review judges them and the distribution buckets them, and a
 * disagreement joins a verdict to a step that was selected at another target.
 *
 * Planned events carry no `icu_ftp` in practice, so the ride's FTP (320 W)
 * decides here — not the athlete's current one (250 W).
 */
const RIDE_FTP = 320;
const ATHLETE_FTP = 250;

const steps = [
  // A support step at 100%: 320 W read at the ride's FTP, 250 W at the athlete's.
  { text: "Warm-up", duration: 600, power: { units: "%ftp", value: 100 } },
  // A work step in watts: key only if 270 W clears 88% of the FTP it is read at
  // — it does for 250 W (220 W floor), not for 320 W (282 W floor).
  { text: "Threshold", duration: 900, power: { units: "w", value: 270 } },
] as PlannedDocStep[];

const EVENT = {
  id: 7,
  category: "WORKOUT",
  type: "Ride",
  name: "Threshold",
  start_date_local: "2026-09-08T00:00:00",
  workout_doc: { steps },
} as IntervalsEvent;

const RIDE = {
  id: "i70",
  name: "Threshold",
  type: "Ride",
  start_date_local: "2026-09-08T07:00:00",
  paired_event_id: 7,
  icu_ftp: RIDE_FTP,
  icu_intervals: [],
} as unknown as Activity;

const LAPS: FitLap[] = [
  { startTimeSeconds: 0, durationSeconds: 600, averageWatts: 320 },
  { startTimeSeconds: 600, durationSeconds: 900, averageWatts: 270 },
] as FitLap[];

function lenses(ride: Activity | null) {
  const athleteFtpReads: string[] = [];
  // No MAP zones: only the FTP-anchored middle band is under test.
  const anchors = pinnedAnchors({
    athlete: async () => {
      athleteFtpReads.push("athlete");
      return { ftp: ATHLETE_FTP };
    },
  });
  const activitiesApi = {
    getActivities: async () => (ride ? [ride] : []),
    getActivity: async () => ride,
    getActivityLaps: async () => LAPS,
    getActivityStreams: async () => ({ watts: Array(1500).fill(200) }),
  } as unknown as IActivitiesApi;
  const eventsApi = {
    getEvents: async () => [EVENT],
    getEvent: async () => EVENT,
  } as unknown as IEventsApi;

  return {
    review: createExecutionReview({
      activitiesApi,
      eventsApi,
      anchors,
      prescription: createPrescription({
        workoutParser: createWorkoutParser(),
      }),
    }),
    athleteFtpReads,
  };
}

const WINDOW = { oldest: "2026-09-01", newest: "2026-09-14" };

describe("one FTP per event, across the digest, review and distribution", () => {
  it("reads the event at its ride's FTP in all three lenses", async () => {
    const { review: lens } = lenses(RIDE);

    const review = await lens.comparePlannedVsActual({ eventId: 7 });
    expect(review.steps[0]!.planned.target).toEqual({ watts: RIDE_FTP });

    // The athlete's middle band is 190–265 W: the warm-up read at 320 W falls
    // outside it, where read at 250 W it would count all 600 s.
    const dist = await lens.compareIntensityDistribution({
      eventId: 7,
    });
    expect(dist.middleBand?.plannedSeconds).toBe(0);

    // 270 W does not clear 88% of 320 W, so the session is not key.
    expect((await lens.getExecutionDigest(WINDOW)).status).toBe("skipped");
  });

  it("falls back to the athlete's FTP in all three when there is no ride", async () => {
    const { review: lens } = lenses(null);

    // The review refuses an unridden session; its FTP shows in the digest,
    // whose selection now reads the plan at the athlete's 250 W.
    const review = await lens.comparePlannedVsActual({ eventId: 7 });
    expect(review.reason).toBe("no-paired-activity");
    expect((await lens.getExecutionDigest(WINDOW)).status).toBe("reviewed");
  });
});
