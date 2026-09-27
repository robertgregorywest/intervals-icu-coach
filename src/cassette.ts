import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { FetchFn } from "./client.js";

// Record/replay seam for skill evals (see issue #20). A cassette is a
// directory holding one JSON file per recorded GET, so concurrent CLI
// processes can record into it without clobbering each other. Writes are
// never sent in either mode — they are appended to a capture file and
// answered with a synthetic success.

export interface EvalServicesOptions {
  apiKey?: string;
  fetchFn?: FetchFn;
  today?: () => string;
}

/**
 * `createServices` options from the eval env switches — `ICU_REPLAY_DIR` (replay) or
 * `ICU_RECORD_DIR` (record), each with `ICU_CAPTURE_FILE` for writes, and
 * `ICU_NOW` to pin "today". `ICU_RECORD_MISSING` alongside a replay dir
 * records whatever the cassette lacks. Empty when none are set.
 */
export function evalServicesOptions(
  env: Record<string, string | undefined>
): EvalServicesOptions {
  const opts: EvalServicesOptions = {};
  if (env.ICU_NOW) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(env.ICU_NOW)) {
      throw new Error(`ICU_NOW must be YYYY-MM-DD, got ${env.ICU_NOW}`);
    }
    const now = env.ICU_NOW;
    opts.today = () => now;
  }
  const dir = env.ICU_REPLAY_DIR ?? env.ICU_RECORD_DIR;
  if (!dir) return opts;
  if (env.ICU_REPLAY_DIR && env.ICU_RECORD_DIR) {
    throw new Error("Set ICU_REPLAY_DIR or ICU_RECORD_DIR, not both");
  }
  const captureFile = env.ICU_CAPTURE_FILE;
  if (!captureFile) {
    throw new Error(
      "ICU_CAPTURE_FILE is required with ICU_REPLAY_DIR/ICU_RECORD_DIR — writes are captured there, never sent"
    );
  }
  if (env.ICU_REPLAY_DIR && env.ICU_RECORD_MISSING) {
    // Top-up: what the cassette holds is replayed, anything else is fetched
    // live and added to it. Needs the real key.
    opts.fetchFn = replayFetch({
      dir,
      captureFile,
      fallback: recordingFetch({ dir, captureFile }),
    });
  } else if (env.ICU_REPLAY_DIR) {
    opts.fetchFn = replayFetch({ dir, captureFile });
    // Replay never reaches the network, so no real key is needed.
    opts.apiKey = env.INTERVALS_API_KEY || "replay";
  } else {
    opts.fetchFn = recordingFetch({ dir, captureFile });
  }
  return opts;
}

export interface CassetteEntry {
  key: string;
  status: number;
  contentType: string;
  /** Response body as text, or base64 when `binary` is set. */
  body: string;
  binary?: boolean;
}

export interface CapturedWrite {
  method: string;
  path: string;
  query: Record<string, string>;
  body: unknown;
}

export interface ReplayMiss {
  key: string;
}

export function cassetteKey(method: string, url: string): string {
  const u = new URL(url);
  const params = [...u.searchParams.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const query = new URLSearchParams(params).toString();
  return `${method.toUpperCase()} ${u.pathname}${query ? `?${query}` : ""}`;
}

/** Every recorded entry in a cassette directory. */
export function readCassette(dir: string): CassetteEntry[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map(
      (f) => JSON.parse(readFileSync(join(dir, f), "utf8")) as CassetteEntry
    );
}

function entryPath(dir: string, key: string): string {
  const hash = createHash("sha1").update(key).digest("hex").slice(0, 16);
  return join(dir, `${hash}.json`);
}

function appendJsonl(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(value) + "\n");
}

function methodOf(init?: RequestInit): string {
  return (init?.method ?? "GET").toUpperCase();
}

function parseBody(init?: RequestInit): unknown {
  if (typeof init?.body !== "string") return undefined;
  try {
    return JSON.parse(init.body);
  } catch {
    return init.body;
  }
}

/** JSON, text and XML are stored readable; anything else as base64. */
function isTextual(contentType: string): boolean {
  return /^text\/|[/+](json|xml)\b|javascript/i.test(contentType);
}

type WriteCapture = (url: string, init: RequestInit | undefined) => Response;

// Echo the request body back as the platform would, with ids filled in — the
// write services only read `id` and the fields they sent.
function writeCapture(captureFile: string): WriteCapture {
  let nextId = 900_000_000;
  const withId = (value: unknown, fallbackId: number | null): unknown => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    if ("id" in value) return value;
    return { ...value, id: fallbackId ?? nextId++ };
  };

  return (url, init) => {
    const u = new URL(url);
    const method = methodOf(init);
    const body = parseBody(init);
    const write: CapturedWrite = {
      method,
      path: u.pathname,
      query: Object.fromEntries(u.searchParams.entries()),
      body,
    };
    appendJsonl(captureFile, write);

    if (method === "DELETE") return new Response(null, { status: 204 });
    const tail = Number(u.pathname.split("/").pop());
    const pathId = Number.isInteger(tail) ? tail : null;
    const echoed = Array.isArray(body)
      ? body.map((item) => withId(item, null))
      : withId(body ?? {}, pathId);
    return jsonResponse(200, echoed);
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function toUrl(input: Parameters<FetchFn>[0]): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

export interface RecordingOptions {
  dir: string;
  captureFile: string;
  fetchFn?: FetchFn;
}

/** Real GETs, saved to the cassette; writes captured, never sent. */
export function recordingFetch(opts: RecordingOptions): FetchFn {
  const realFetch = opts.fetchFn ?? globalThis.fetch;
  const capture = writeCapture(opts.captureFile);
  mkdirSync(opts.dir, { recursive: true });
  return async (input, init) => {
    const url = toUrl(input);
    const method = methodOf(init);
    if (method !== "GET") return capture(url, init);

    const response = await realFetch(input, init);
    const contentType = response.headers.get("content-type") ?? "";
    const binary = !isTextual(contentType);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const key = cassetteKey(method, url);
    // Errors are not recorded — a transient 5xx must not become the fixture.
    if (response.ok) {
      const entry: CassetteEntry = {
        key,
        status: response.status,
        contentType,
        body: binary
          ? Buffer.from(bytes).toString("base64")
          : new TextDecoder().decode(bytes),
        ...(binary ? { binary: true } : {}),
      };
      writeFileSync(entryPath(opts.dir, key), JSON.stringify(entry, null, 2));
    }
    return new Response(response.status === 204 ? null : bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
}

export interface ReplayOptions {
  dir: string;
  captureFile: string;
  /** Where unrecorded GETs are logged; defaults beside the capture file. */
  missesFile?: string;
  /** Answers unrecorded GETs instead of a 404 — a recordingFetch, to top up. */
  fallback?: FetchFn;
}

/** GETs answered from the cassette; writes captured, never sent. */
export function replayFetch(opts: ReplayOptions): FetchFn {
  const missesFile =
    opts.missesFile ?? join(dirname(opts.captureFile), "misses.jsonl");
  const capture = writeCapture(opts.captureFile);
  return async (input, init) => {
    const url = toUrl(input);
    const method = methodOf(init);
    if (method !== "GET") return capture(url, init);

    const key = cassetteKey(method, url);
    const file = entryPath(opts.dir, key);
    if (!existsSync(file)) {
      if (opts.fallback) return opts.fallback(input, init);
      const miss: ReplayMiss = { key };
      appendJsonl(missesFile, miss);
      return jsonResponse(404, {
        error: `Not in the recorded scenario: ${key}`,
      });
    }
    const entry = JSON.parse(readFileSync(file, "utf8")) as CassetteEntry;
    const body = entry.binary
      ? Buffer.from(entry.body, "base64")
      : entry.body || null;
    return new Response(body, {
      status: entry.status,
      headers: { "content-type": entry.contentType },
    });
  };
}
