import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  cassetteKey,
  evalServicesOptions,
  readCassette,
  recordingFetch,
  replayFetch,
} from "../src/cassette.js";
import { createServices } from "../src/index.js";
import { getFitnessSummaryTool } from "../src/tools/wellness.js";

const BASE = "https://intervals.icu/api/v1/athlete/i1";

function readJsonl(file: string): unknown[] {
  return readFileSync(file, "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
}

let tmp: string;
let dir: string;
let captureFile: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "cassette-"));
  dir = join(tmp, "cassette");
  captureFile = join(tmp, "writes.jsonl");
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("cassetteKey", () => {
  it("ignores query parameter order", () => {
    expect(cassetteKey("get", `${BASE}/wellness?oldest=a&newest=b`)).toBe(
      cassetteKey("GET", `${BASE}/wellness?newest=b&oldest=a`)
    );
  });

  it("drops the host and keeps method, path and query", () => {
    expect(cassetteKey("GET", `${BASE}/events?x=1`)).toBe(
      "GET /api/v1/athlete/i1/events?x=1"
    );
  });
});

describe("record then replay", () => {
  it("replays a recorded GET without touching the network", async () => {
    const real = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: "2026-09-01", ctl: 50 }]), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    const rec = recordingFetch({ dir, captureFile, fetchFn: real });
    const recorded = await rec(`${BASE}/wellness?oldest=a&newest=b`);
    expect(await recorded.json()).toEqual([{ id: "2026-09-01", ctl: 50 }]);

    const replay = replayFetch({ dir, captureFile });
    const replayed = await replay(`${BASE}/wellness?newest=b&oldest=a`);
    expect(replayed.status).toBe(200);
    expect(await replayed.json()).toEqual([{ id: "2026-09-01", ctl: 50 }]);
    expect(real).toHaveBeenCalledTimes(1);
  });

  it("round-trips binary bodies", async () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    const real = vi.fn().mockResolvedValue(
      new Response(bytes, {
        status: 200,
        headers: { "content-type": "application/octet-stream" },
      })
    );
    await recordingFetch({ dir, captureFile, fetchFn: real })(`${BASE}/file`);
    expect(readCassette(dir)[0]).toMatchObject({ binary: true });
    const replayed = await replayFetch({ dir, captureFile })(`${BASE}/file`);
    expect(new Uint8Array(await replayed.arrayBuffer())).toEqual(bytes);
  });

  it("stores JSON readable, keyed at the top of the entry", async () => {
    const real = vi.fn().mockResolvedValue(
      new Response('{"id":"i1"}', {
        status: 200,
        headers: { "content-type": "application/json;charset=UTF-8" },
      })
    );
    await recordingFetch({ dir, captureFile, fetchFn: real })(BASE);
    expect(readCassette(dir)).toEqual([
      {
        key: "GET /api/v1/athlete/i1",
        status: 200,
        contentType: "application/json;charset=UTF-8",
        body: '{"id":"i1"}',
      },
    ]);
  });

  it("does not record error responses", async () => {
    const real = vi
      .fn()
      .mockResolvedValue(new Response("down", { status: 503 }));
    const res = await recordingFetch({ dir, captureFile, fetchFn: real })(
      `${BASE}/events`
    );
    expect(res.status).toBe(503);
    expect(readdirSync(dir)).toHaveLength(0);
  });
});

describe("replay misses", () => {
  it("answers 404 and logs the miss", async () => {
    const res = await replayFetch({ dir, captureFile })(`${BASE}/activities`);
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({
      error: expect.stringContaining("GET /api/v1/athlete/i1/activities"),
    });
    expect(readJsonl(join(tmp, "misses.jsonl"))).toEqual([
      { key: "GET /api/v1/athlete/i1/activities" },
    ]);
  });

  it("tops up the cassette through a fallback instead of missing", async () => {
    const real = vi
      .fn()
      .mockImplementation(async () => new Response("[1]", { status: 200 }));
    const topUp = replayFetch({
      dir,
      captureFile,
      fallback: recordingFetch({ dir, captureFile, fetchFn: real }),
    });
    expect(await (await topUp(`${BASE}/activities`)).json()).toEqual([1]);
    await topUp(`${BASE}/activities`);
    expect(real).toHaveBeenCalledTimes(1);

    const replayed = await replayFetch({ dir, captureFile })(
      `${BASE}/activities`
    );
    expect(await replayed.json()).toEqual([1]);
    expect(readdirSync(tmp)).not.toContain("misses.jsonl");
  });
});

describe("readCassette", () => {
  it("is empty for a cassette not yet recorded", () => {
    expect(readCassette(dir)).toEqual([]);
  });
});

describe("write capture", () => {
  it.each(["record", "replay"] as const)(
    "never sends writes in %s mode",
    async (mode) => {
      const real = vi.fn();
      const f =
        mode === "record"
          ? recordingFetch({ dir, captureFile, fetchFn: real })
          : replayFetch({ dir, captureFile });
      const res = await f(`${BASE}/events/bulk?upsert=true`, {
        method: "POST",
        body: JSON.stringify([{ name: "VO2 5x4", start_date_local: "x" }]),
      });
      expect(real).not.toHaveBeenCalled();
      const echoed = (await res.json()) as Array<{ id: number; name: string }>;
      expect(echoed[0].name).toBe("VO2 5x4");
      expect(typeof echoed[0].id).toBe("number");
      expect(readJsonl(captureFile)).toEqual([
        {
          method: "POST",
          path: "/api/v1/athlete/i1/events/bulk",
          query: { upsert: "true" },
          body: [{ name: "VO2 5x4", start_date_local: "x" }],
        },
      ]);
    }
  );

  it("echoes the path id on PUT and answers DELETE with 204", async () => {
    const f = replayFetch({ dir, captureFile });
    const put = await f(`${BASE}/events/42`, {
      method: "PUT",
      body: JSON.stringify({ name: "moved" }),
    });
    expect(await put.json()).toEqual({ name: "moved", id: 42 });
    const del = await f(`${BASE}/events/42`, { method: "DELETE" });
    expect(del.status).toBe(204);
    expect(readJsonl(captureFile)).toHaveLength(2);
  });
});

describe("evalServicesOptions", () => {
  it("is empty when no switch is set", () => {
    expect(evalServicesOptions({})).toEqual({});
  });

  it("pins today from ICU_NOW", () => {
    expect(evalServicesOptions({ ICU_NOW: "2026-09-06" }).today?.()).toBe(
      "2026-09-06"
    );
  });

  it("rejects a malformed ICU_NOW", () => {
    expect(() => evalServicesOptions({ ICU_NOW: "yesterday" })).toThrow(
      /YYYY-MM-DD/
    );
  });

  it("supplies a dummy key in replay mode", () => {
    const opts = evalServicesOptions({
      ICU_REPLAY_DIR: dir,
      ICU_CAPTURE_FILE: captureFile,
    });
    expect(opts.apiKey).toBe("replay");
    expect(opts.fetchFn).toBeTypeOf("function");
  });

  it("keeps the real key when topping up a cassette", () => {
    const opts = evalServicesOptions({
      ICU_REPLAY_DIR: dir,
      ICU_CAPTURE_FILE: captureFile,
      ICU_RECORD_MISSING: "1",
    });
    expect(opts.apiKey).toBeUndefined();
    expect(opts.fetchFn).toBeTypeOf("function");
  });

  it.each(["ICU_REPLAY_DIR", "ICU_RECORD_DIR"])(
    "requires a capture file with %s",
    (switchName) => {
      expect(() => evalServicesOptions({ [switchName]: dir })).toThrow(
        /ICU_CAPTURE_FILE is required/
      );
    }
  );

  it("rejects replay and record together", () => {
    expect(() =>
      evalServicesOptions({ ICU_REPLAY_DIR: dir, ICU_RECORD_DIR: dir })
    ).toThrow(/not both/);
  });
});

describe("createServices with eval seams", () => {
  function services(fetchFn: typeof fetch) {
    return createServices({
      apiKey: "k",
      athleteId: "i1",
      fetchFn,
      today: () => "2026-09-06",
    });
  }

  function okJson(body: unknown): Response {
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  it("routes requests through the injected fetch on the pinned day", async () => {
    const fetchFn = vi.fn().mockResolvedValue(okJson({ id: "2026-09-06" }));
    await getFitnessSummaryTool.handler(services(fetchFn), {});
    expect(fetchFn.mock.calls[0][0]).toBe(`${BASE}/wellness/2026-09-06`);
  });

  it("starts the default training week on the pinned day's Monday", async () => {
    const fetchFn = vi.fn().mockImplementation(async () => okJson([]));
    const summary =
      await services(fetchFn).trainingWeek.getTrainingWeekSummary();
    // 2026-09-06 is a Sunday.
    expect(summary.week).toEqual({ start: "2026-08-31", end: "2026-09-06" });
  });
});
