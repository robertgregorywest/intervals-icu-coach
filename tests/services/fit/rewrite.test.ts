import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createFitCodec } from "../../../src/services/fit/index.js";
import { fitCrc } from "../../../src/services/fit/crc.js";
import {
  FitFormatError,
  readFields,
  walkFit,
  type FitMessage,
} from "../../../src/services/fit/format.js";

/**
 * Real bytes from the Wahoo ELEMNT BOLT that recorded the 2026-07-12 track
 * session (`i164949895`), cut to run 1's 158 records plus every definition, the
 * lap, session, device and a few of the manufacturer-specific messages — copied
 * verbatim, so layout, endianness and the proprietary messages are the device's
 * own. The BOLT had a wheel sensor that day, so the records carry speed.
 */
function fixture(): Uint8Array {
  const path = fileURLToPath(
    new URL(
      "../../fixtures/drivetrain-speed/track-2026-07-12-run-1.fit",
      import.meta.url
    )
  );
  return new Uint8Array(readFileSync(path));
}

const fit = createFitCodec();

const RECORD = 20;
const LAP = 19;
const SESSION = 18;
const PATCHED = new Set([RECORD, LAP, SESSION]);

function dataOf(bytes: Uint8Array, global: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return walkFit(bytes)
    .messages.filter(
      (m) => m.kind === "data" && m.definition.globalMessageNumber === global
    )
    .map((m) => readFields(view, m));
}

/**
 * Remove `distance` and `speed` from every record definition and data message —
 * the file a head unit with no speed sensor writes.
 */
function stripSpeed(bytes: Uint8Array): Uint8Array {
  const { headerSize, messages } = walkFit(bytes);
  const drop = new Set([5, 6]);
  const chunks: number[] = Array.from(bytes.subarray(0, headerSize));
  const isRecord = (m: FitMessage) =>
    m.definition.globalMessageNumber === RECORD;

  for (const m of messages) {
    if (!isRecord(m)) {
      chunks.push(...bytes.subarray(m.start, m.end));
      continue;
    }
    const fields = m.definition.fields;
    if (m.kind === "definition") {
      const kept = fields.filter((f) => !drop.has(f.fieldNumber));
      chunks.push(...bytes.subarray(m.start, m.start + 5), kept.length);
      for (const f of kept) chunks.push(f.fieldNumber, f.size, f.baseType);
      chunks.push(...bytes.subarray(m.start + 6 + fields.length * 3, m.end));
      continue;
    }
    chunks.push(bytes[m.start]);
    let at = m.start + 1;
    for (const f of fields) {
      if (!drop.has(f.fieldNumber))
        chunks.push(...bytes.subarray(at, at + f.size));
      at += f.size;
    }
    chunks.push(...bytes.subarray(at, m.end));
  }

  const out = new Uint8Array(chunks.length + 2);
  out.set(chunks);
  const view = new DataView(out.buffer);
  view.setUint32(4, chunks.length - headerSize, true);
  view.setUint16(12, fitCrc(out, 0, 12), true);
  view.setUint16(chunks.length, fitCrc(out, 0, chunks.length), true);
  return out;
}

/** A plain ramp: one m/s more every sample, distance integrated at 1 Hz. */
function ramp(count: number) {
  let distance = 0;
  return Array.from({ length: count }, (_, i) => {
    const speed = 10 + (i % 5) * 0.5;
    const value = { speed, distance };
    distance += speed;
    return value;
  });
}

describe("rewriteSpeed", () => {
  it("writes each record's speed and distance, and reads back what it wrote", () => {
    const bytes = fixture();
    const values = ramp(fit.readRecords(bytes).length);

    const records = fit.readRecords(fit.rewriteSpeed(bytes, values));

    expect(records).toHaveLength(158);
    records.forEach((r, i) => {
      expect(r.speed).toBeCloseTo(values[i].speed, 3);
      expect(r.distance).toBeCloseTo(values[i].distance, 2);
    });
  });

  it("copies every message other than record, lap and session byte for byte", () => {
    const bytes = fixture();
    const out = fit.rewriteSpeed(bytes, ramp(158));

    const before = walkFit(bytes).messages;
    const after = walkFit(out).messages;
    expect(after).toHaveLength(before.length);
    before.forEach((m, i) => {
      if (PATCHED.has(m.definition.globalMessageNumber)) return;
      expect(out.subarray(after[i].start, after[i].end)).toEqual(
        bytes.subarray(m.start, m.end)
      );
    });
  });

  it("leaves every other record field untouched", () => {
    const bytes = fixture();
    const before = dataOf(bytes, RECORD);
    const after = dataOf(fit.rewriteSpeed(bytes, ramp(158)), RECORD);

    before.forEach((fields, i) => {
      for (const [field, value] of fields) {
        if (field === 5 || field === 6) continue;
        expect(after[i].get(field)).toBe(value);
      }
    });
  });

  it("writes valid header and file CRCs", () => {
    const out = fit.rewriteSpeed(fixture(), ramp(158));
    const view = new DataView(out.buffer);
    expect(view.getUint16(12, true)).toBe(fitCrc(out, 0, 12));
    expect(view.getUint16(out.length - 2, true)).toBe(
      fitCrc(out, 0, out.length - 2)
    );
    expect(view.getUint32(4, true)).toBe(out.length - 2 - out[0]);
  });

  it("recomputes lap and session totals from the samples it wrote", () => {
    const values = ramp(158);
    const out = fit.rewriteSpeed(fixture(), values);

    for (const totals of [...dataOf(out, LAP), ...dataOf(out, SESSION)]) {
      // The single lap spans the whole ride, so it covers every kept record.
      const last = values[values.length - 1];
      expect(totals.get(9)! / 100).toBeCloseTo(last.distance, 1);
    }
    const session = dataOf(out, SESSION)[0];
    expect(session.get(15)! / 1000).toBe(12); // max of the ramp
    // Average over timer time, the FIT convention.
    expect(session.get(14)! / 1000).toBeCloseTo(
      session.get(9)! / 100 / (session.get(8)! / 1000),
      3
    );
  });

  it("writes the same stream whether or not the input had a speed sensor", () => {
    const bytes = fixture();
    const stripped = stripSpeed(bytes);
    expect(fit.readRecords(stripped).every((r) => r.speed === null)).toBe(true);

    const values = ramp(158);
    const fromSensor = fit.rewriteSpeed(bytes, values);
    const fromBare = fit.rewriteSpeed(stripped, values);

    expect(fit.readRecords(fromBare)).toEqual(fit.readRecords(fromSensor));
    expect(dataOf(fromBare, SESSION)).toEqual(dataOf(fromSensor, SESSION));
    expect(dataOf(fromBare, LAP)).toEqual(dataOf(fromSensor, LAP));
  });

  it("writes the invalid sentinel for a sample with no speed", () => {
    const values = ramp(158).map((v, i) =>
      i === 3 ? { ...v, speed: null } : v
    );
    const records = fit.readRecords(fit.rewriteSpeed(fixture(), values));
    expect(records[3].speed).toBeNull();
    expect(records[3].distance).toBeCloseTo(values[3].distance, 2);
  });

  it("refuses a value count that does not match the records", () => {
    expect(() => fit.rewriteSpeed(fixture(), ramp(3))).toThrow(FitFormatError);
  });

  it("refuses a chained file", () => {
    const bytes = fixture();
    const chained = new Uint8Array(bytes.length * 2);
    chained.set(bytes);
    chained.set(bytes, bytes.length);
    expect(() => fit.rewriteSpeed(chained, ramp(158))).toThrow(/Chained/);
  });

  it("refuses bytes that are not a FIT file", () => {
    expect(() =>
      fit.rewriteSpeed(
        new TextEncoder().encode("<html>not a fit file</html>"),
        []
      )
    ).toThrow(FitFormatError);
  });
});

describe("readRecords", () => {
  it("reads the sensor speed, distance and whole-rpm cadence the device wrote", () => {
    const records = fit.readRecords(fixture());
    expect(records).toHaveLength(158);
    const pedalling = records.filter((r) => (r.cadence ?? 0) > 90);
    expect(pedalling.length).toBeGreaterThan(90);
    for (const r of pedalling) {
      expect(Number.isInteger(r.cadence)).toBe(true);
      // 65x16 on a 2099 mm rollout, give or take the sensor's +0.6%.
      expect(r.speed! / (r.cadence! / 60)).toBeGreaterThan(8.2);
      expect(r.speed! / (r.cadence! / 60)).toBeLessThan(8.9);
    }
  });
});
