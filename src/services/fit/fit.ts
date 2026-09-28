import { decodeFitLaps } from "./laps.js";
import { readFitRecords } from "./records.js";
import { rewriteFitSpeed } from "./rewrite.js";
import type { IFitCodec } from "./types.js";

export function createFitCodec(): IFitCodec {
  return {
    decodeLaps: decodeFitLaps,
    readRecords: readFitRecords,
    rewriteSpeed: rewriteFitSpeed,
  };
}
