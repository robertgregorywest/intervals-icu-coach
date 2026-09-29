/**
 * The **MAP zones** (CONTEXT.md, ADR 0003): the zone model every coaching lens
 * reasons in. Shared because the Athlete anchors derive them live, the power
 * profile computes them for a what-if MAP, and a tool's schema names them.
 */

// Coefficients and prose ported verbatim from
// https://www.cyclecoach.com/calculator (inline calculateMapZones JS).
// Ric Stern / CycleCoach — kept inline so refresh against source is trivial.

export const ZONE_NAMES = [
  "REC",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
  "NMP",
] as const;

export type ZoneName = (typeof ZONE_NAMES)[number];

/** One MAP zone, in both %MAP and watts. See ADR 0003. */
export interface ZoneRow {
  name: ZoneName;
  label: string;
  lowPct: number;
  highPct: number;
  lowW: number;
  highW: number;
  pctText: string;
  wattText: string;
}

const ZONE_DEFS: Array<{
  name: ZoneRow["name"];
  label: string;
  low: number;
  high: number;
}> = [
  {
    name: "REC",
    label: 'Recovery rides, "walk on the pedals" (~30–90 min)',
    low: 0.0,
    high: 0.4,
  },
  {
    name: "L1",
    label: "Long and/or steady rides, easier group rides (~1–6 h)",
    low: 0.4,
    high: 0.55,
  },
  {
    name: "L2",
    label: "Core endurance, quality group rides, paceline (~1–4 h)",
    low: 0.5,
    high: 0.65,
  },
  {
    name: "L3",
    label: "Moderate endurance / hard tempo / harder group rides (~30–120 min)",
    low: 0.6,
    high: 0.7,
  },
  {
    name: "L4",
    label:
      "Intensive endurance / long climbs / shorter road races (~10–60 min)",
    low: 0.65,
    high: 0.75,
  },
  {
    name: "L5",
    label: "Threshold tolerance / TTs / climbs / crits / track (~4–20 min)",
    low: 0.7,
    high: 0.85,
  },
  {
    name: "L6",
    label: "Maximal aerobic / short climbs / pursuit (~1–5 min)",
    low: 0.8,
    high: 1.1,
  },
  {
    name: "L7",
    label: "High-intensity anaerobic / sprint endurance (~20–60 s)",
    low: 1.1,
    high: 1.5,
  },
  {
    name: "NMP",
    label: "Neuromuscular power / max sprints (~5–20 s)",
    low: 1.5,
    high: 2.0,
  },
];

/**
 * The MAP zones anchored on `mapWatts`. The 5s peak only caps the NMP zone's
 * top end; without one NMP is open-ended.
 */
export function computeMapZones(
  mapWatts: number,
  p5s: number | null
): ZoneRow[] {
  return ZONE_DEFS.map((z) => {
    const lowW = Math.round(z.low * mapWatts);
    let highW = Math.round(z.high * mapWatts);
    const lowPct = Math.round(z.low * 100);
    const highPct = Math.round(z.high * 100);
    let pctText: string;
    let wattText: string;
    if (z.name === "NMP") {
      pctText = "150%+";
      if (p5s != null && p5s > lowW) {
        highW = Math.round(p5s);
        wattText = `${lowW}–${highW} W`;
      } else {
        wattText = `${lowW} W and above`;
      }
    } else {
      pctText = `${lowPct}–${highPct}%`;
      wattText = `${lowW}–${highW} W`;
    }
    return {
      name: z.name,
      label: z.label,
      lowPct,
      highPct,
      lowW,
      highW,
      pctText,
      wattText,
    };
  });
}
