/**
 * The pasted-or-stored choice both track alignment tools share.
 *
 * It lives in the handler rather than the schema because the MCP adapter
 * registers `schema.shape`, which only a plain `ZodObject` has — so these are
 * the tests that a bad combination is refused at all.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  resolveTrackInputs,
  TrackInputError,
} from "../../src/tools/track-inputs.js";
import { normalizeActivityId } from "../../src/services/activities/index.js";
import {
  createTrackSessions,
  loadTrackSessionRecords,
} from "../../src/services/track-sessions/index.js";
import type { IIntervalsClient } from "../../src/index.js";

const FIXTURES = fileURLToPath(
  new URL("../fixtures/track-sessions", import.meta.url)
);

function fixtureClient(): IIntervalsClient {
  const service = createTrackSessions({
    load: () => loadTrackSessionRecords(FIXTURES),
  });
  return { trackSessions: service } as unknown as IIntervalsClient;
}

const client = fixtureClient();

describe("resolveTrackInputs", () => {
  it("takes the splits, activity and lap length from a record", () => {
    const resolved = resolveTrackInputs(client, {
      sessionId: "2026-09-06-bmrc-ip",
    });
    expect(resolved.activityId).toBe("i183857008");
    expect(resolved.lapDistanceMeters).toBe(250);
    expect(resolved.splits).toContain("race,250,22.86,22.86");
  });

  it("passes pasted splits through, normalising a bare activity number", () => {
    const resolved = resolveTrackInputs(client, {
      activityId: 173732945,
      splits: "run-1,250,16.26,16.26",
    });
    expect(resolved).toEqual({
      activityId: "i173732945",
      splits: "run-1,250,16.26,16.26",
      lapDistanceMeters: undefined,
    });
  });

  it("lets an explicit activity and lap length override the record's", () => {
    const resolved = resolveTrackInputs(client, {
      sessionId: "2026-09-06-bmrc-ip",
      activityId: 999,
      lapDistanceMeters: 333.33,
    });
    expect(resolved.activityId).toBe("i999");
    expect(resolved.lapDistanceMeters).toBe(333.33);
  });

  it("refuses both a session id and pasted splits", () => {
    // They could disagree, and there is no principled way to pick a winner.
    expect(() =>
      resolveTrackInputs(client, {
        sessionId: "2026-09-06-bmrc-ip",
        splits: "run-1,250,16.26,16.26",
      })
    ).toThrow(TrackInputError);
  });

  it("refuses a call with neither", () => {
    expect(() => resolveTrackInputs(client, { activityId: "i1" })).toThrow(
      /Supply splits .* or sessionId/
    );
  });

  it("refuses pasted splits with no activity to align them to", () => {
    expect(() => resolveTrackInputs(client, { splits: "x" })).toThrow(
      /activityId is required when splits are pasted/
    );
  });

  it("says why a record with no ride behind it cannot be aligned", () => {
    // 2025 Nationals: a timing export and nothing else.
    expect(() =>
      resolveTrackInputs(client, { sessionId: "2025-nationals-ip" })
    ).toThrow(/has no activityId/);
  });

  it("aligns a record with no ride when the caller supplies one", () => {
    const resolved = resolveTrackInputs(client, {
      sessionId: "2025-nationals-ip",
      activityId: "i1",
    });
    expect(resolved.activityId).toBe("i1");
    expect(resolved.splits).toContain("race,250,");
  });

  it("surfaces an unknown session id from the service", () => {
    expect(() =>
      resolveTrackInputs(client, { sessionId: "no-such-session" })
    ).toThrow(/No track session record/);
  });
});

describe("normalizeActivityId", () => {
  it("prefixes a bare id and leaves a prefixed one alone", () => {
    expect(normalizeActivityId(173732945)).toBe("i173732945");
    expect(normalizeActivityId("173732945")).toBe("i173732945");
    expect(normalizeActivityId("i173732945")).toBe("i173732945");
  });
});
