import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServices, type IServices } from "../../src/index.js";
import { runCli, type CliIO } from "../../src/cli/main.js";
import { evalServicesOptions, recordingFetch } from "../../src/cassette.js";

function makeIO(isTTY = false): CliIO & {
  outLines: string[];
  errLines: string[];
  exitCode: number | null;
} {
  const outLines: string[] = [];
  const errLines: string[] = [];
  let exitCode: number | null = null;
  return {
    outLines,
    errLines,
    get exitCode() {
      return exitCode;
    },
    stdout(s: string) {
      outLines.push(s);
    },
    stderr(s: string) {
      errLines.push(s);
    },
    exit(code: number) {
      exitCode = code;
    },
    isTTY,
  };
}

function makeServices(): IServices {
  return {
    athlete: {
      getAthlete: vi.fn().mockResolvedValue({ id: "i0", name: "Test" }),
    },
    wellness: {
      getWellness: vi.fn().mockResolvedValue([]),
      getWellnessDay: vi.fn().mockResolvedValue({}),
    },
    events: {
      deleteEvents: vi.fn().mockResolvedValue(undefined),
      getEvent: vi.fn().mockResolvedValue({ id: 1, category: "NOTE" }),
    },
    workoutScheduling: {
      updateEvent: vi.fn().mockResolvedValue({ id: 1 }),
    },
    today: () => "2026-01-01",
  } as unknown as IServices;
}

describe("CLI describe command", () => {
  it("emits 33 tools and instructions when called with no names", async () => {
    const io = makeIO();
    await runCli(["describe"], () => makeServices(), io);

    expect(io.exitCode).toBeNull();
    expect(io.outLines).toHaveLength(1);
    const doc = JSON.parse(io.outLines[0]);
    expect(doc.tools).toHaveLength(33);
    expect(typeof doc.instructions).toBe("string");
    expect(doc.instructions.length).toBeGreaterThan(0);
  });

  it("narrows to matching tools when names given", async () => {
    const io = makeIO();
    await runCli(
      ["describe", "get_athlete", "create_workout"],
      () => makeServices(),
      io
    );

    expect(io.exitCode).toBeNull();
    const doc = JSON.parse(io.outLines[0]);
    expect(doc.tools).toHaveLength(2);
    const names = doc.tools.map((t: { name: string }) => t.name);
    expect(names).toContain("get_athlete");
    expect(names).toContain("create_workout");
  });

  it("each tool entry has name, description, annotations, inputSchema", async () => {
    const io = makeIO();
    await runCli(["describe", "get_athlete"], () => makeServices(), io);

    const doc = JSON.parse(io.outLines[0]);
    const t = doc.tools[0];
    expect(t.name).toBe("get_athlete");
    expect(typeof t.description).toBe("string");
    expect(t.annotations).toBeDefined();
    expect(t.inputSchema).toBeDefined();
    expect(t.inputSchema.type).toBe("object");
  });

  it("exits 1 when a named tool does not exist", async () => {
    const io = makeIO();
    await runCli(["describe", "nonexistent_tool"], () => makeServices(), io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("nonexistent_tool");
  });

  it("pretty-prints when isTTY=true", async () => {
    const io = makeIO(true);
    await runCli(["describe", "get_athlete"], () => makeServices(), io);

    expect(io.exitCode).toBeNull();
    expect(io.outLines[0]).toContain("\n");
  });

  it("compact output when isTTY=false", async () => {
    const io = makeIO(false);
    await runCli(["describe", "get_athlete"], () => makeServices(), io);

    expect(io.outLines[0]).not.toContain("\n");
  });

  it("does not call clientFactory for describe", async () => {
    const factory = vi.fn().mockReturnValue(makeServices());
    const io = makeIO();
    await runCli(["describe"], factory, io);

    expect(factory).not.toHaveBeenCalled();
  });
});

describe("CLI tool invocation", () => {
  it("runs get_athlete with empty JSON input", async () => {
    const services = makeServices();
    const io = makeIO();
    await runCli(["get_athlete", "--json", "{}"], () => services, io);

    expect(io.exitCode).toBeNull();
    const result = JSON.parse(io.outLines[0]);
    expect(result.name).toBe("Test");
  });

  it("runs get_athlete with no --json (empty input implied)", async () => {
    const services = makeServices();
    const io = makeIO();
    await runCli(["get_athlete"], () => services, io);

    expect(io.exitCode).toBeNull();
    const result = JSON.parse(io.outLines[0]);
    expect(result.name).toBe("Test");
  });

  it("exits 1 when tool not found", async () => {
    const io = makeIO();
    await runCli(["no_such_tool"], () => makeServices(), io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("no_such_tool");
  });

  it("exits 1 on Zod validation failure", async () => {
    const io = makeIO();
    await runCli(
      ["get_events", "--json", '{"oldest":"bad-date","newest":"2026-01-01"}'],
      () => makeServices(),
      io
    );

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("Validation error");
  });

  it("exits 1 on handler error", async () => {
    const services = makeServices();
    (services.athlete.getAthlete as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("API down")
    );
    const io = makeIO();
    await runCli(["get_athlete"], () => services, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("API down");
  });
});

describe("CLI --yes guard for destructive tools", () => {
  it("refuses delete_events without --yes", async () => {
    const services = makeServices();
    const io = makeIO();
    await runCli(
      ["delete_events", "--json", '{"ids":[{"id":1}]}'],
      () => services,
      io
    );

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("--yes");
    expect(services.events.deleteEvents).not.toHaveBeenCalled();
  });

  it("runs delete_events with --yes", async () => {
    const services = makeServices();
    const io = makeIO();
    await runCli(
      ["delete_events", "--json", '{"ids":[{"id":1}]}', "--yes"],
      () => services,
      io
    );

    expect(io.exitCode).toBeNull();
    expect(services.events.deleteEvents).toHaveBeenCalled();
  });

  it("refuses update_event without --yes", async () => {
    const services = makeServices();
    const io = makeIO();
    await runCli(
      ["update_event", "--json", '{"id":1,"name":"Renamed"}'],
      () => services,
      io
    );

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("--yes");
  });
});

describe("CLI --help", () => {
  it("exits 0 and mentions describe", async () => {
    const io = makeIO();
    await runCli(["--help"], () => makeServices(), io);

    expect(io.exitCode).toBe(0);
    const output = io.outLines.join("\n") + io.errLines.join("\n");
    expect(output).toContain("describe");
  });
});

// What bin/icu does under the eval harness: the services built from the env
// switches, so a skill's CLI calls replay a cassette and capture writes.
describe("CLI under eval replay", () => {
  let tmp: string;
  let env: Record<string, string>;

  beforeEach(async () => {
    tmp = mkdtempSync(join(tmpdir(), "cli-replay-"));
    env = {
      ICU_REPLAY_DIR: join(tmp, "cassette"),
      ICU_CAPTURE_FILE: join(tmp, "writes.jsonl"),
      ICU_NOW: "2026-09-06",
    };
    const live = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "i1", name: "Recorded" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
    );
    await recordingFetch({
      dir: env.ICU_REPLAY_DIR,
      captureFile: env.ICU_CAPTURE_FILE,
      fetchFn: live,
    })("https://intervals.icu/api/v1/athlete/i1");
  });

  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  const services = () =>
    createServices({
      apiKey: "",
      athleteId: "i1",
      ...evalServicesOptions(env),
    });

  it("answers a read from the cassette with no API key", async () => {
    const io = makeIO();
    await runCli(["get_athlete"], services, io);
    expect(io.exitCode).toBeNull();
    expect(JSON.parse(io.outLines[0])).toMatchObject({ name: "Recorded" });
  });

  it("captures create_workout instead of sending it", async () => {
    const io = makeIO();
    await runCli(
      [
        "create_workout",
        "--json",
        JSON.stringify({
          name: "VO2 5x4",
          date: "2026-09-08",
          sportType: "Ride",
          steps: [{ duration: "4m", target: "300w" }],
        }),
      ],
      services,
      io
    );
    expect(io.errLines).toEqual([]);
    const [write] = readFileSync(env.ICU_CAPTURE_FILE, "utf8")
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l));
    expect(write).toMatchObject({
      method: "POST",
      path: expect.stringMatching(/\/athlete\/i1\/events/),
    });
    expect(JSON.stringify(write.body)).toContain("2026-09-08");
  });

  it("reports an unrecorded read as a clear error", async () => {
    const io = makeIO();
    await runCli(["get_fitness_summary"], services, io);
    expect(io.exitCode).toBe(1);
    expect(io.errLines.join("\n")).toMatch(/Not in the recorded scenario/);
  });
});
