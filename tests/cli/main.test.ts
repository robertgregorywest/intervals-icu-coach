import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServices } from "../../src/index.js";
import { runCli, type CliIO } from "../../src/cli/main.js";
import { evalServicesOptions, recordingFetch } from "../../src/cassette.js";
import { TOOLS } from "../../src/registry.js";
import { STUB_SERVICES, stubTools } from "../helpers/stub-tools.js";

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

const SERVICES = () => STUB_SERVICES;

describe("CLI describe command", () => {
  it("emits every tool and no instructions when called with no names", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["describe"], tools, SERVICES, io);

    expect(io.exitCode).toBeNull();
    expect(io.outLines).toHaveLength(1);
    const doc = JSON.parse(io.outLines[0]);
    expect(doc.tools.map((t: { name: string }) => t.name)).toEqual([
      "read_thing",
      "delete_thing",
    ]);
    expect(doc.instructions).toBeUndefined();
  });

  it("narrows to matching tools when names given", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["describe", "delete_thing"], tools, SERVICES, io);

    expect(io.exitCode).toBeNull();
    const doc = JSON.parse(io.outLines[0]);
    expect(doc.tools.map((t: { name: string }) => t.name)).toEqual([
      "delete_thing",
    ]);
  });

  it("each tool entry has name, description, annotations, inputSchema", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["describe", "read_thing"], tools, SERVICES, io);

    const [t] = JSON.parse(io.outLines[0]).tools;
    expect(t.name).toBe("read_thing");
    expect(t.description).toBe("Reads a thing.");
    expect(t.annotations).toEqual(tools[0].annotations);
    expect(t.inputSchema.type).toBe("object");
    expect(Object.keys(t.inputSchema.properties)).toEqual(["date"]);
  });

  it("exits 1 when a named tool does not exist", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["describe", "nonexistent_tool"], tools, SERVICES, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("nonexistent_tool");
  });

  it("pretty-prints when isTTY=true", async () => {
    const { tools } = stubTools();
    const io = makeIO(true);
    await runCli(["describe", "read_thing"], tools, SERVICES, io);

    expect(io.exitCode).toBeNull();
    expect(io.outLines[0]).toContain("\n");
  });

  it("compact output when isTTY=false", async () => {
    const { tools } = stubTools();
    const io = makeIO(false);
    await runCli(["describe", "read_thing"], tools, SERVICES, io);

    expect(io.outLines[0]).not.toContain("\n");
  });

  it("does not build services for describe", async () => {
    const { tools } = stubTools();
    const factory = vi.fn(SERVICES);
    const io = makeIO();
    await runCli(["describe"], tools, factory, io);

    expect(factory).not.toHaveBeenCalled();
  });

  // Every real Tool's schema must convert to JSON Schema, or `icu describe`
  // throws for the whole catalogue.
  it("describes every registered Tool", async () => {
    const io = makeIO();
    await runCli(["describe"], TOOLS, SERVICES, io);

    expect(io.exitCode).toBeNull();
    const doc = JSON.parse(io.outLines[0]);
    expect(doc.tools.map((t: { name: string }) => t.name)).toEqual(
      TOOLS.map((t) => t.name)
    );
  });
});

describe("CLI tool invocation", () => {
  it("passes the services and parsed --json input to the handler", async () => {
    const { tools, readHandler } = stubTools();
    const io = makeIO();
    await runCli(
      ["read_thing", "--json", '{"date":"2026-01-01"}'],
      tools,
      SERVICES,
      io
    );

    expect(io.exitCode).toBeNull();
    expect(readHandler).toHaveBeenCalledWith(STUB_SERVICES, {
      date: "2026-01-01",
    });
    expect(JSON.parse(io.outLines[0])).toEqual({ date: "2026-01-01" });
  });

  it("implies empty input with no --json", async () => {
    const { tools, readHandler } = stubTools();
    const io = makeIO();
    await runCli(["read_thing"], tools, SERVICES, io);

    expect(io.exitCode).toBeNull();
    expect(readHandler).toHaveBeenCalledWith(STUB_SERVICES, {});
    expect(JSON.parse(io.outLines[0])).toEqual({ date: null });
  });

  it("reads input from --file", async () => {
    const { tools, readHandler } = stubTools();
    const dir = mkdtempSync(join(tmpdir(), "cli-file-"));
    const file = join(dir, "input.json");
    writeFileSync(file, '{"date":"2026-02-02"}');
    const io = makeIO();
    try {
      await runCli(["read_thing", "--file", file], tools, SERVICES, io);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    expect(io.exitCode).toBeNull();
    expect(readHandler).toHaveBeenCalledWith(STUB_SERVICES, {
      date: "2026-02-02",
    });
  });

  it("exits 1 on invalid --json", async () => {
    const { tools, readHandler } = stubTools();
    const io = makeIO();
    await runCli(["read_thing", "--json", "{nope"], tools, SERVICES, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("Invalid JSON");
    expect(readHandler).not.toHaveBeenCalled();
  });

  it("exits 1 when tool not found", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["no_such_tool"], tools, SERVICES, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("no_such_tool");
  });

  it("exits 1 on Zod validation failure", async () => {
    const { tools, readHandler } = stubTools();
    const io = makeIO();
    await runCli(
      ["read_thing", "--json", '{"date":"bad-date"}'],
      tools,
      SERVICES,
      io
    );

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("Validation error");
    expect(readHandler).not.toHaveBeenCalled();
  });

  it("exits 1 on input that fails a schema refinement", async () => {
    const { tools, writeHandler } = stubTools();
    const io = makeIO();
    await runCli(
      ["delete_thing", "--json", '{"id":-1}', "--yes"],
      tools,
      SERVICES,
      io
    );

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("id must be positive");
    expect(writeHandler).not.toHaveBeenCalled();
  });

  it("exits 1 on handler error", async () => {
    const { tools, readHandler } = stubTools();
    readHandler.mockRejectedValueOnce(new Error("API down"));
    const io = makeIO();
    await runCli(["read_thing"], tools, SERVICES, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("API down");
  });
});

describe("CLI --yes guard for destructive tools", () => {
  it("refuses a destructive tool without --yes", async () => {
    const { tools, writeHandler } = stubTools();
    const io = makeIO();
    await runCli(["delete_thing", "--json", '{"id":1}'], tools, SERVICES, io);

    expect(io.exitCode).toBe(1);
    expect(io.errLines[0]).toContain("--yes");
    expect(writeHandler).not.toHaveBeenCalled();
  });

  it("runs a destructive tool with --yes", async () => {
    const { tools, writeHandler } = stubTools();
    const io = makeIO();
    await runCli(
      ["delete_thing", "--json", '{"id":1}', "--yes"],
      tools,
      SERVICES,
      io
    );

    expect(io.exitCode).toBeNull();
    expect(writeHandler).toHaveBeenCalledWith(STUB_SERVICES, { id: 1 });
    expect(JSON.parse(io.outLines[0])).toEqual({ deleted: 1 });
  });
});

describe("CLI --help", () => {
  it("exits 0 and mentions describe", async () => {
    const { tools } = stubTools();
    const io = makeIO();
    await runCli(["--help"], tools, SERVICES, io);

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
    await runCli(["get_athlete"], TOOLS, services, io);
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
      TOOLS,
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
    await runCli(["get_fitness_summary"], TOOLS, services, io);
    expect(io.exitCode).toBe(1);
    expect(io.errLines.join("\n")).toMatch(/Not in the recorded scenario/);
  });
});
