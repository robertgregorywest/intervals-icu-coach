/**
 * A **Track input** — a stored record or a pasted export — resolved by the
 * Track module for both `align` and `write`.
 *
 * "Exactly one of" cannot be a schema refinement — the MCP adapter registers
 * `schema.shape`, which `.refine()` erases — so these are the tests that a bad
 * combination is refused at all. The API stub records which activity the
 * resolved input reached for, then stops: what is under test is the
 * resolution, not the fit.
 */

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  createTrack,
  TrackInputError,
  type TrackInput,
} from "../../../src/services/track/index.js";
import { loadTrackSessionRecords } from "../../../src/services/track/records/loader.js";
import type { IActivitiesApi } from "../../../src/services/activities/index.js";
import { createFitCodec } from "../../../src/services/fit/index.js";

const FIXTURES = fileURLToPath(
  new URL("../../fixtures/track-sessions", import.meta.url)
);

class Reached extends Error {}

function trackOver(dir = FIXTURES) {
  const requested: string[] = [];
  const activitiesApi = {
    getActivityStreams: async (id: string) => {
      requested.push(id);
      throw new Reached(id);
    },
  } as unknown as IActivitiesApi;
  const track = createTrack({
    activitiesApi,
    fit: createFitCodec(),
    load: () => loadTrackSessionRecords(dir),
  });
  return { track, requested };
}

/** The input untyped, as an adapter hands it over. */
const loose = (input: Record<string, unknown>) => input as TrackInput;

describe("resolving a Track input", () => {
  it("takes the splits, activity and lap length from a record", async () => {
    const { track, requested } = trackOver();
    // Reaching the API means the record's splits parsed at its lap length.
    await expect(
      track.align({ sessionId: "2026-09-06-bmrc-ip" })
    ).rejects.toThrow(Reached);
    expect(requested).toEqual(["i183857008"]);
  });

  it("normalises a bare activity number on pasted splits", async () => {
    const { track, requested } = trackOver();
    await expect(
      track.align({
        activityId: 173732945,
        splits: "run-1,250,16.26,16.26\nrun-1,500,32.69,16.43",
      })
    ).rejects.toThrow(Reached);
    expect(requested).toEqual(["i173732945"]);
  });

  it("lets an explicit activity override the record's", async () => {
    const { track, requested } = trackOver();
    await expect(
      track.align({ sessionId: "2026-09-06-bmrc-ip", activityId: 999 })
    ).rejects.toThrow(Reached);
    expect(requested).toEqual(["i999"]);
  });

  it("lets an explicit lap length override the record's", async () => {
    const { track, requested } = trackOver();
    // The record's 250 m laps do not advance by 333.33, so the override
    // reached the parser.
    await expect(
      track.align({
        sessionId: "2026-09-06-bmrc-ip",
        lapDistanceMeters: 333.33,
      })
    ).rejects.toThrow(/333\.33/);
    expect(requested).toEqual([]);
  });

  it("resolves identically for align and write", async () => {
    // The invariant the module exists to hold: a preview is what gets written.
    const { track, requested } = trackOver();
    await expect(
      track.align({ sessionId: "2026-09-06-bmrc-ip" })
    ).rejects.toThrow(Reached);
    await expect(
      track.write({ sessionId: "2026-09-06-bmrc-ip", preview: true })
    ).rejects.toThrow(Reached);
    expect(requested).toEqual(["i183857008", "i183857008"]);
  });

  it("refuses both a session id and pasted splits", async () => {
    // They could disagree, and there is no principled way to pick a winner.
    const { track } = trackOver();
    const both = loose({
      sessionId: "2026-09-06-bmrc-ip",
      splits: "run-1,250,16.26,16.26",
    });
    await expect(track.align(both)).rejects.toThrow(TrackInputError);
    await expect(track.write(both)).rejects.toThrow(TrackInputError);
  });

  it("refuses a call with neither", async () => {
    const { track } = trackOver();
    await expect(track.align(loose({ activityId: "i1" }))).rejects.toThrow(
      /Supply splits .* or sessionId/
    );
  });

  it("refuses pasted splits with no activity to align them to", async () => {
    const { track } = trackOver();
    await expect(track.align(loose({ splits: "x" }))).rejects.toThrow(
      /activityId is required when splits are pasted/
    );
  });

  it("says why a record with no ride behind it cannot be aligned", async () => {
    // 2025 Nationals: a timing export and nothing else.
    const { track } = trackOver();
    await expect(
      track.align({ sessionId: "2025-nationals-ip" })
    ).rejects.toThrow(/has no activityId/);
  });

  it("aligns a record with no ride when the caller supplies one", async () => {
    const { track, requested } = trackOver();
    await expect(
      track.align({ sessionId: "2025-nationals-ip", activityId: "i1" })
    ).rejects.toThrow(Reached);
    expect(requested).toEqual(["i1"]);
  });

  it("names the available sessions when the id is unknown", async () => {
    const { track } = trackOver();
    await expect(track.align({ sessionId: "no-such-session" })).rejects.toThrow(
      /No track session record.*Available: .*2026-nationals-ip/
    );
  });

  it("says so plainly when no records are loaded at all", async () => {
    const { track } = trackOver("/nonexistent/track-records");
    await expect(track.align({ sessionId: "anything" })).rejects.toThrow(
      /No records are loaded/
    );
  });
});
