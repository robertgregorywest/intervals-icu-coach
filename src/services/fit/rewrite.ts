/**
 * Writing speed and distance into a FIT file, and nothing else.
 *
 * Every message is copied byte for byte except three: `record` messages take
 * the supplied speed and cumulative distance, and `lap` and `session` messages
 * take distance and speed totals recomputed from those same samples, so the
 * file agrees with itself. A definition lacking a field it needs is extended,
 * never reordered: existing fields keep their positions and the new ones go
 * after them, before any developer fields. Both CRCs are recomputed. See
 * `docs/adr/0012-fit-files-rewritten-in-place.md` for why this is not a
 * decode-and-re-encode.
 *
 * Knows nothing about where the speed came from.
 */

import { fitCrc } from "./crc.js";
import {
  BASE_UINT16,
  BASE_UINT32,
  FIELD_TIMESTAMP,
  FitFormatError,
  fieldOffset,
  readField,
  walkFit,
  writeUnsigned,
  type FitMessage,
} from "./format.js";
import { RECORD_GLOBAL_MESSAGE } from "./records.js";

/** What one `record` message is given. */
export interface RecordSpeed {
  /** m/s; `null` writes the invalid sentinel — no claim for this sample. */
  speed: number | null;
  /** Cumulative metres at this sample. */
  distance: number | null;
}

const LAP_GLOBAL_MESSAGE = 19;
const SESSION_GLOBAL_MESSAGE = 18;

// Summary-message fields shared by lap and session.
const FIELD_START_TIME = 2;
const FIELD_TOTAL_ELAPSED_TIME = 7;
const FIELD_TOTAL_TIMER_TIME = 8;
const FIELD_TOTAL_DISTANCE = 9;

type Quantity = "distance" | "speed" | "avgSpeed" | "maxSpeed";

interface PatchedField {
  fieldNumber: number;
  quantity: Quantity;
  scale: number;
  /** Appended when missing; otherwise only overwritten if already present. */
  append?: { size: number; baseType: number };
}

const u32 = { size: 4, baseType: BASE_UINT32 };
const u16 = { size: 2, baseType: BASE_UINT16 };

/** Field numbers and scales from the FIT global profile. */
const PATCHES: Record<number, PatchedField[]> = {
  [RECORD_GLOBAL_MESSAGE]: [
    { fieldNumber: 5, quantity: "distance", scale: 100, append: u32 },
    { fieldNumber: 6, quantity: "speed", scale: 1000, append: u16 },
    { fieldNumber: 73, quantity: "speed", scale: 1000 }, // enhanced_speed
  ],
  [LAP_GLOBAL_MESSAGE]: [
    {
      fieldNumber: FIELD_TOTAL_DISTANCE,
      quantity: "distance",
      scale: 100,
      append: u32,
    },
    { fieldNumber: 13, quantity: "avgSpeed", scale: 1000, append: u16 },
    { fieldNumber: 14, quantity: "maxSpeed", scale: 1000, append: u16 },
    { fieldNumber: 110, quantity: "avgSpeed", scale: 1000 }, // enhanced_avg_speed
    { fieldNumber: 111, quantity: "maxSpeed", scale: 1000 }, // enhanced_max_speed
  ],
  [SESSION_GLOBAL_MESSAGE]: [
    {
      fieldNumber: FIELD_TOTAL_DISTANCE,
      quantity: "distance",
      scale: 100,
      append: u32,
    },
    { fieldNumber: 14, quantity: "avgSpeed", scale: 1000, append: u16 },
    { fieldNumber: 15, quantity: "maxSpeed", scale: 1000, append: u16 },
    { fieldNumber: 124, quantity: "avgSpeed", scale: 1000 }, // enhanced_avg_speed
    { fieldNumber: 125, quantity: "maxSpeed", scale: 1000 }, // enhanced_max_speed
  ],
};

type Values = Partial<Record<Quantity, number | null>>;

/**
 * Return a copy of `bytes` with `values[i]` written into the i-th `record`
 * message. Throws `FitFormatError` when the file cannot be walked, is a chained
 * FIT file, or `values` does not have one entry per record.
 */
export function rewriteFitSpeed(
  bytes: Uint8Array,
  values: RecordSpeed[]
): Uint8Array {
  const stream = walkFit(bytes);
  const { headerSize, dataEnd, messages } = stream;
  if (bytes.length > dataEnd + 2) {
    throw new FitFormatError(
      "Chained FIT files (more than one file in the upload) are not supported."
    );
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = messages.filter(
    (m) =>
      m.kind === "data" &&
      m.definition.globalMessageNumber === RECORD_GLOBAL_MESSAGE
  );
  if (records.length !== values.length) {
    throw new FitFormatError(
      `Got ${values.length} speed values for ${records.length} records.`
    );
  }
  const samples = toSamples(records, values);

  // Which fields each patched definition appends, by its message index.
  const appended = new Map<number, PatchedField[]>();
  const chunks: Uint8Array[] = [bytes.slice(0, headerSize)];
  let recordIndex = 0;

  messages.forEach((message, index) => {
    const patches = PATCHES[message.definition.globalMessageNumber];
    if (!patches) {
      chunks.push(bytes.subarray(message.start, message.end));
      return;
    }

    if (message.kind === "definition") {
      const present = new Set(
        message.definition.fields.map((f) => f.fieldNumber)
      );
      const toAppend = patches.filter(
        (p) => p.append && !present.has(p.fieldNumber)
      );
      appended.set(index, toAppend);
      chunks.push(extendDefinition(bytes, message, toAppend));
      return;
    }

    const own: Values =
      message.definition.globalMessageNumber === RECORD_GLOBAL_MESSAGE
        ? {
            distance: values[recordIndex].distance,
            speed: values[recordIndex++].speed,
          }
        : summaryTotals(view, message, samples);
    chunks.push(
      rewriteData(
        bytes,
        message,
        patches,
        appended.get(message.definitionIndex) ?? [],
        own
      )
    );
  });

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total + 2);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }

  const outView = new DataView(out.buffer);
  outView.setUint32(4, total - headerSize, true);
  if (headerSize === 14) outView.setUint16(12, fitCrc(out, 0, 12), true);
  outView.setUint16(total, fitCrc(out, 0, total), true);
  return out;
}

function extendDefinition(
  bytes: Uint8Array,
  message: FitMessage,
  toAppend: PatchedField[]
): Uint8Array {
  if (toAppend.length === 0) return bytes.subarray(message.start, message.end);

  const { definition } = message;
  const fieldsEnd = message.start + 6 + definition.fields.length * 3;
  const extra = toAppend.length * 3;
  const out = new Uint8Array(message.end - message.start + extra);
  out.set(bytes.subarray(message.start, fieldsEnd), 0);
  out[5] = definition.fields.length + toAppend.length;
  toAppend.forEach((p, i) => {
    out.set(
      [p.fieldNumber, p.append!.size, p.append!.baseType],
      fieldsEnd - message.start + i * 3
    );
  });
  // Developer field definitions, if any, follow the standard ones unchanged.
  out.set(
    bytes.subarray(fieldsEnd, message.end),
    fieldsEnd - message.start + extra
  );
  return out;
}

function rewriteData(
  bytes: Uint8Array,
  message: FitMessage,
  patches: PatchedField[],
  toAppend: PatchedField[],
  values: Values
): Uint8Array {
  const { definition } = message;
  const le = definition.littleEndian;
  const devStart = message.end - definition.developerBytes;
  const extra = toAppend.reduce((n, p) => n + p.append!.size, 0);

  const out = new Uint8Array(message.end - message.start + extra);
  out.set(bytes.subarray(message.start, devStart), 0);
  const view = new DataView(out.buffer);

  const scaled = (p: PatchedField) => {
    const v = values[p.quantity];
    return v === null || v === undefined ? null : v * p.scale;
  };

  for (const p of patches) {
    const field = definition.fields.find(
      (f) => f.fieldNumber === p.fieldNumber
    );
    if (!field) continue;
    const at = fieldOffset(message, p.fieldNumber) - message.start;
    writeUnsigned(view, at, field.baseType, scaled(p), le);
  }

  let at = devStart - message.start;
  for (const p of toAppend) {
    writeUnsigned(view, at, p.append!.baseType, scaled(p), le);
    at += p.append!.size;
  }
  out.set(bytes.subarray(devStart, message.end), at);
  return out;
}

interface Sample {
  timestamp: number;
  speed: number | null;
  /** Cumulative, carried forward over nulls. */
  distance: number;
}

function toSamples(records: FitMessage[], values: RecordSpeed[]): Sample[] {
  const samples: Sample[] = [];
  let distance = 0;
  records.forEach((m, i) => {
    if (values[i].distance !== null) distance = values[i].distance!;
    if (m.timestamp === undefined) return;
    samples.push({ timestamp: m.timestamp, speed: values[i].speed, distance });
  });
  return samples;
}

/**
 * A lap's or session's totals over its own window, from the same samples the
 * records carry. Distance is the cumulative figure's rise across the window;
 * average speed is over timer time, the FIT convention, so a paused stretch
 * does not dilute it.
 */
function summaryTotals(
  view: DataView,
  message: FitMessage,
  samples: Sample[]
): Values {
  const start = readField(view, message, FIELD_START_TIME);
  const endStamp = readField(view, message, FIELD_TIMESTAMP);
  const elapsedMs = readField(view, message, FIELD_TOTAL_ELAPSED_TIME);
  const timerMs = readField(view, message, FIELD_TOTAL_TIMER_TIME);
  const end =
    endStamp ??
    (start !== null && elapsedMs !== null ? start + elapsedMs / 1000 : null);
  if (start === null || end === null || samples.length === 0) {
    return { distance: null, avgSpeed: null, maxSpeed: null };
  }

  const distanceAt = (t: number) => {
    let d = 0;
    for (const s of samples) {
      if (s.timestamp > t) break;
      d = s.distance;
    }
    return d;
  };
  const distance = Math.max(0, distanceAt(end) - distanceAt(start));

  let maxSpeed: number | null = null;
  for (const s of samples) {
    if (s.timestamp <= start || s.timestamp > end || s.speed === null) continue;
    maxSpeed = maxSpeed === null ? s.speed : Math.max(maxSpeed, s.speed);
  }

  const seconds = timerMs !== null ? timerMs / 1000 : end - start;
  return {
    distance,
    avgSpeed: seconds > 0 ? distance / seconds : null,
    maxSpeed,
  };
}
