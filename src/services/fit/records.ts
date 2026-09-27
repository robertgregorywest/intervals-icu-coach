/**
 * Reading the per-sample `record` messages — just the channels a speed
 * rewrite needs, in file order.
 */

import { readField, walkFit, type FitMessage } from "./format.js";

export const RECORD_GLOBAL_MESSAGE = 20;

const FIELD_DISTANCE = 5;
const FIELD_SPEED = 6;
const FIELD_CADENCE = 4;
const FIELD_ENHANCED_SPEED = 73;

/** One `record` message, scaled to SI units. */
export interface FitRecord {
  /** Seconds since the FIT epoch; `null` when the message carries none. */
  timestamp: number | null;
  /** Whole rpm — FIT's `cadence` is a `uint8`. */
  cadence: number | null;
  /** m/s: `speed`, or `enhanced_speed` when only that was written. */
  speed: number | null;
  /** Cumulative metres. */
  distance: number | null;
}

/**
 * Every `record` message in file order. Throws `FitFormatError` when the file
 * cannot be walked.
 */
export function readFitRecords(bytes: Uint8Array): FitRecord[] {
  const { messages } = walkFit(bytes);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return recordMessages(messages).map((m) => {
    const speed =
      readField(view, m, FIELD_SPEED) ??
      readField(view, m, FIELD_ENHANCED_SPEED);
    const distance = readField(view, m, FIELD_DISTANCE);
    return {
      timestamp: m.timestamp ?? null,
      cadence: readField(view, m, FIELD_CADENCE),
      speed: speed === null ? null : speed / 1000,
      distance: distance === null ? null : distance / 100,
    };
  });
}

export function recordMessages(messages: FitMessage[]): FitMessage[] {
  return messages.filter(
    (m) =>
      m.kind === "data" &&
      m.definition.globalMessageNumber === RECORD_GLOBAL_MESSAGE
  );
}
