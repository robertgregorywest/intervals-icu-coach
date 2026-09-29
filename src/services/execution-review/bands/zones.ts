import type { PartitionBand, ZoneRow } from "./types.js";

/**
 * Reduce the athlete's coaching zones to a frame seconds can be bucketed into.
 *
 * The MAP zones deliberately **overlap** — a band answers "what is this ride
 * for", and rides of different purposes legitimately share wattages, so at
 * MAP 415 W the L2 band (208–270 W) and the L3 band (249–291 W) both contain
 * 260 W. That is correct for the zone model and useless as a histogram: every
 * watt from 208 to 457 would be counted two or more times and the per-zone
 * seconds would exceed the session.
 *
 * So the frame is the ladder of *lower* bounds, which is strictly increasing:
 * a wattage belongs to the highest zone whose floor it reaches. Read as "the
 * hardest band this wattage qualifies for". The resulting bands are narrower
 * than the coaching bands they are named after — the partition's L2 is
 * 208–249 W against the coaching band's 208–270 W — which is why `PartitionBand`
 * carries `coachingHighW` and every result reports the frame it used.
 */
export function derivePartition(zones: ZoneRow[]): PartitionBand[] {
  if (zones.length === 0) return [];

  const sorted = [...zones].sort((a, b) => a.lowW - b.lowW);

  // Asserted rather than assumed: the whole construction rests on the floors
  // being strictly increasing, and a future zone-model edit that broke it would
  // otherwise produce a silently wrong histogram.
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].lowW <= sorted[i - 1].lowW) {
      throw new Error(
        `Coaching zones do not form a usable frame: ${sorted[i].name} starts at ` +
          `${sorted[i].lowW} W, which does not exceed ${sorted[i - 1].name} at ` +
          `${sorted[i - 1].lowW} W. Bucketing needs strictly increasing floors.`
      );
    }
  }

  return sorted.map((z, i) => ({
    name: z.name,
    lowW: z.lowW,
    highW: sorted[i + 1]?.lowW,
    coachingHighW: z.highW,
  }));
}

/**
 * The band a wattage falls in, or `undefined` when it sits below the frame's
 * floor. `highW` is exclusive so that a wattage exactly on a boundary belongs
 * to the band it opens, and the top band is open-ended.
 */
export function bandFor(
  partition: PartitionBand[],
  watts: number
): PartitionBand | undefined {
  for (let i = partition.length - 1; i >= 0; i--) {
    if (watts >= partition[i].lowW) return partition[i];
  }
  return undefined;
}
