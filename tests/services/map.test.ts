import { describe, it, expect } from "vitest";
import { createMap } from "../../src/services/map/index.js";
import type {
  Activity,
  ActivityStreams,
  IActivitiesApi,
} from "../../src/services/activities/index.js";

function fakeActivitiesApi(
  activities: Partial<Activity>[] = [],
  streamsById: Record<string, Partial<ActivityStreams>> = {}
): IActivitiesApi {
  return {
    getActivities: async () => activities as Activity[],
    getActivity: async (id) => {
      const found = activities.find((a) => String(a.id) === String(id));
      return (found ?? {}) as Activity;
    },
    getActivityStreams: async (id) =>
      (streamsById[String(id)] ?? {}) as ActivityStreams,
  };
}

function makeRampStream(secs: number, peakStartIdx: number): number[] {
  // Constant 100 W background; peak window of 60s at 394 W.
  const stream = new Array(secs).fill(100);
  for (let i = peakStartIdx; i < peakStartIdx + 60 && i < secs; i++) {
    stream[i] = 394;
  }
  return stream;
}

describe("IMap.deriveLatest", () => {
  it("derives MAP from the most recent ramp test", async () => {
    const stream = makeRampStream(1000, 800);
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "i7777",
          name: "MAP ramp test",
          start_date_local: "2026-03-15T10:00:00",
        } as Activity,
      ],
      { i7777: { watts: stream } }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map).not.toBeNull();
    expect(result.map?.watts).toBe(394);
    expect(result.map?.computedFrom).toEqual({
      metric: "best_60s",
      activityId: "i7777",
      activityName: "MAP ramp test",
      activityDate: "2026-03-15",
      daysAgo: 55,
    });
    expect(result.mapWarning).toBeUndefined();
  });

  it("picks the most recent when multiple ramp tests are in the window", async () => {
    const oldStream = makeRampStream(800, 600);
    const oldStream360 = oldStream.map((v) => (v === 394 ? 360 : v));
    const newStream = makeRampStream(900, 700);
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "old",
          name: "MAP ramp test 2026-02-01",
          start_date_local: "2026-02-01T09:00:00",
        } as unknown as Activity,
        {
          id: "new",
          name: "MAP ramp test 2026-04-12",
          start_date_local: "2026-04-12T09:00:00",
        } as unknown as Activity,
      ],
      {
        old: { watts: oldStream360 },
        new: { watts: newStream },
      }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map?.watts).toBe(394);
    expect(result.map?.computedFrom.activityId).toBe("new");
    expect(result.map?.computedFrom.daysAgo).toBe(27);
  });

  it("excludes activities whose name contains (skip)", async () => {
    const goodStream = makeRampStream(800, 600);
    const skipStream = makeRampStream(800, 600).map((v) =>
      v === 394 ? 250 : v
    );
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "skip",
          name: "MAP ramp test (skip)",
          start_date_local: "2026-04-25T09:00:00",
        } as unknown as Activity,
        {
          id: "good",
          name: "MAP ramp test",
          start_date_local: "2026-03-15T09:00:00",
        } as unknown as Activity,
      ],
      {
        skip: { watts: skipStream },
        good: { watts: goodStream },
      }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map?.watts).toBe(394);
    expect(result.map?.computedFrom.activityId).toBe("good");
  });

  it("returns null + warning when no ramp test is in the 90-day window", async () => {
    const activitiesApi = fakeActivitiesApi([
      {
        id: "i1",
        name: "Morning Ride",
        start_date_local: "2026-04-12T09:00:00",
      } as Activity,
    ]);

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map).toBeNull();
    expect(result.mapWarning).toMatch(/90 days/);
    expect(result.mapWarning).toMatch(/MAP/);
  });

  it("returns null + warning when matching activity has no power data", async () => {
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "i42",
          name: "MAP ramp test",
          start_date_local: "2026-04-20T09:00:00",
        } as Activity,
      ],
      { i42: {} }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map).toBeNull();
    expect(result.mapWarning).toMatch(/no power data/i);
    expect(result.mapWarning).toMatch(/MAP ramp test/);
    expect(result.mapWarning).toMatch(/2026-04-20/);
  });

  it("only matches names with the prefix, not anywhere", async () => {
    const stream = makeRampStream(800, 600);
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "noisy",
          name: "Morning Ride after MAP ramp test",
          start_date_local: "2026-04-15T09:00:00",
        } as unknown as Activity,
      ],
      { noisy: { watts: stream } }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map).toBeNull();
    expect(result.mapWarning).toMatch(/90 days/);
  });

  it("matches case-insensitively", async () => {
    const stream = makeRampStream(800, 600);
    const activitiesApi = fakeActivitiesApi(
      [
        {
          id: "lower",
          name: "map ramp test #4",
          start_date_local: "2026-04-15T09:00:00",
        } as unknown as Activity,
      ],
      { lower: { watts: stream } }
    );

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map?.watts).toBe(394);
  });

  it("returns null + warning when getActivities throws", async () => {
    const activitiesApi: IActivitiesApi = {
      getActivities: async () => {
        throw new Error("boom");
      },
      getActivity: async () => ({}) as Activity,
      getActivityStreams: async () => ({}) as ActivityStreams,
    };

    const result = await createMap({ activitiesApi }).deriveLatest(
      "2026-05-09"
    );

    expect(result.map).toBeNull();
    expect(result.mapWarning).toMatch(/MAP/);
  });
});
