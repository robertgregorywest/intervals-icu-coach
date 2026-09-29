// Coefficients, thresholds and prose ported verbatim from
// https://www.cyclecoach.com/calculator (inline calculateMapZones JS).
// Ric Stern / CycleCoach — kept inline so refresh against source is trivial.

import type {
  AllometricResult,
  CompoundResult,
  FtpCheck,
  MapBandResult,
  PowerProfileResult,
  PstsResult,
  ResolvedInputs,
  RiderTypeResult,
  Sex,
  TpProfileRow,
  Vo2Result,
  TtEstimateRow,
  RaceEstimateRow,
} from "./types.js";
import { computeMapZones } from "../../shared/map-zones.js";

const CD_FACTOR_BY_POSITION: Record<string, number> = {
  road_hoods: 0.7,
  road_drops: 0.65,
  tt: 0.55,
  upright: 0.75,
};

const TP_PROFILE: Record<
  Sex,
  Record<"5s" | "1min" | "5min" | "FTP", Array<{ name: string; low: number }>>
> = {
  male: {
    "5s": [
      { name: "World Class", low: 21.59 },
      { name: "Exceptional", low: 19.96 },
      { name: "Excellent", low: 18.33 },
      { name: "Very Good", low: 16.43 },
      { name: "Good", low: 14.79 },
      { name: "Moderate", low: 13.16 },
      { name: "Fair", low: 11.53 },
      { name: "Untrained", low: 10.17 },
    ],
    "1min": [
      { name: "World Class", low: 10.47 },
      { name: "Exceptional", low: 9.78 },
      { name: "Excellent", low: 9.09 },
      { name: "Very Good", low: 8.28 },
      { name: "Good", low: 7.59 },
      { name: "Moderate", low: 6.9 },
      { name: "Fair", low: 6.21 },
      { name: "Untrained", low: 5.64 },
    ],
    "5min": [
      { name: "World Class", low: 6.77 },
      { name: "Exceptional", low: 6.05 },
      { name: "Excellent", low: 5.43 },
      { name: "Very Good", low: 4.7 },
      { name: "Good", low: 4.08 },
      { name: "Moderate", low: 3.46 },
      { name: "Fair", low: 2.84 },
      { name: "Untrained", low: 2.33 },
    ],
    FTP: [
      { name: "World Class", low: 5.6 },
      { name: "Exceptional", low: 5.07 },
      { name: "Excellent", low: 4.53 },
      { name: "Very Good", low: 3.91 },
      { name: "Good", low: 3.38 },
      { name: "Moderate", low: 2.84 },
      { name: "Fair", low: 2.31 },
      { name: "Untrained", low: 1.86 },
    ],
  },
  female: {
    "5s": [
      { name: "World Class", low: 17.48 },
      { name: "Exceptional", low: 16.19 },
      { name: "Excellent", low: 14.89 },
      { name: "Very Good", low: 13.39 },
      { name: "Good", low: 12.09 },
      { name: "Moderate", low: 10.8 },
      { name: "Fair", low: 9.51 },
      { name: "Untrained", low: 8.43 },
    ],
    "1min": [
      { name: "World Class", low: 8.47 },
      { name: "Exceptional", low: 7.93 },
      { name: "Excellent", low: 7.39 },
      { name: "Very Good", low: 6.75 },
      { name: "Good", low: 6.21 },
      { name: "Moderate", low: 5.66 },
      { name: "Fair", low: 5.12 },
      { name: "Untrained", low: 4.67 },
    ],
    "5min": [
      { name: "World Class", low: 5.78 },
      { name: "Exceptional", low: 5.22 },
      { name: "Excellent", low: 4.67 },
      { name: "Very Good", low: 4.02 },
      { name: "Good", low: 3.46 },
      { name: "Moderate", low: 2.91 },
      { name: "Fair", low: 2.35 },
      { name: "Untrained", low: 1.89 },
    ],
    FTP: [
      { name: "World Class", low: 4.95 },
      { name: "Exceptional", low: 4.46 },
      { name: "Excellent", low: 3.97 },
      { name: "Very Good", low: 3.39 },
      { name: "Good", low: 2.9 },
      { name: "Moderate", low: 2.4 },
      { name: "Fair", low: 1.91 },
      { name: "Untrained", low: 1.5 },
    ],
  },
};

const TP_RANK: Record<string, number> = {
  "World Class": 8,
  Exceptional: 7,
  Excellent: 6,
  "Very Good": 5,
  Good: 4,
  Moderate: 3,
  Fair: 2,
  Untrained: 1,
};

const VO2_BANDS_MALE = [
  { name: "World Class", low: 75 },
  { name: "Exceptional", low: 68 },
  { name: "Excellent", low: 62 },
  { name: "Very Good", low: 56 },
  { name: "Good", low: 50 },
  { name: "Moderate", low: 44 },
  { name: "Fair", low: 38 },
  { name: "Untrained", low: 0 },
];

const VO2_BANDS_FEMALE = [
  { name: "World Class", low: 64 },
  { name: "Exceptional", low: 58 },
  { name: "Excellent", low: 53 },
  { name: "Very Good", low: 48 },
  { name: "Good", low: 42 },
  { name: "Moderate", low: 36 },
  { name: "Fair", low: 31 },
  { name: "Untrained", low: 0 },
];

const TT_EVENTS = [
  { name: "3 km TT", low: 0.89, high: 0.91 },
  { name: "4 km TT", low: 0.88, high: 0.91 },
  { name: "16.1 km TT", low: 0.75, high: 0.81 },
  { name: "40.2 km TT", low: 0.72, high: 0.77 },
  { name: "80.5 km TT", low: 0.64, high: 0.72 },
  { name: "161 km TT", low: 0.6, high: 0.68 },
];

export function computeFtpCheck(
  mapWatts: number,
  ftp: number | null
): FtpCheck {
  const estFtpLow = 0.72 * mapWatts;
  const estFtpHigh = 0.77 * mapWatts;
  const estFtpRange: [number, number] = [
    Math.round(estFtpLow),
    Math.round(estFtpHigh),
  ];
  let status: FtpCheck["status"] = "missing";
  let ratioPct: number | null = null;
  let summary = `Your estimated FTP (based on MAP) is ${estFtpRange[0]}–${estFtpRange[1]} W (about 72–77% of MAP). `;
  if (ftp != null && ftp > 0) {
    const ratio = ftp / mapWatts;
    ratioPct = ratio * 100;
    let comment = "";
    if (ratio < 0.72) {
      status = "low";
      comment =
        "Your entered FTP is relatively low compared to MAP (<72%). This can suggest strong short-duration capacity relative to longer efforts, or that your FTP test under-performed.";
    } else if (ratio <= 0.77) {
      status = "typical";
      comment =
        "Your entered FTP is within a typical range relative to MAP (about 72–77%). This is where many well-tested athletes sit.";
    } else {
      status = "high";
      comment =
        "Your entered FTP is high relative to MAP (>77%). In many cases this indicates that the FTP value from a ramp test may be over-estimated for sustained efforts. You may find longer TTs or climbs feel harder than the number suggests.";
    }
    summary += `With FTP at ${ftp.toFixed(0)} W and MAP at ${mapWatts.toFixed(0)} W, your FTP is ${ratioPct.toFixed(1)}% of MAP. ${comment}`;
  } else {
    summary +=
      "If you also perform a separate FTP or 40–60 minute test, you can compare the result to this range to see whether your FTP is likely under- or over-estimated.";
  }
  return {
    mapWatts,
    enteredFtp: ftp,
    estFtpRange,
    ratioPct,
    status,
    summary,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function estimateFrontalAreaBassett(
  heightM: number,
  massKg: number
): number | null {
  if (heightM <= 0 || massKg <= 0) return null;
  return 0.0293 * heightM * Math.pow(massKg, 0.425) + 0.0604;
}

export interface CdaArgs {
  heightCm: number | null;
  massKg: number | null;
  position: string | null;
  knownCda: number | null;
}

export interface CdaResult {
  cda: number;
  method: "known" | "estimated";
  area: number | null;
  cdFactor: number | null;
}

export function computeCda(args: CdaArgs): CdaResult | null {
  if (args.knownCda != null && args.knownCda > 0) {
    return {
      cda: clamp(args.knownCda, 0.15, 0.6),
      method: "known",
      area: null,
      cdFactor: null,
    };
  }
  if (!args.position) return null;
  const cd = CD_FACTOR_BY_POSITION[args.position];
  if (cd == null) return null;
  if (args.heightCm == null || args.massKg == null) return null;
  const heightM = args.heightCm / 100;
  const area = estimateFrontalAreaBassett(heightM, args.massKg);
  if (area == null) return null;
  const cda = clamp(cd * area * 1.05, 0.15, 0.6);
  return { cda, method: "estimated", area, cdFactor: cd };
}

export function computePsts(
  powerW: number,
  massKg: number,
  cda: number
): number | null {
  if (powerW <= 0 || massKg <= 0 || cda <= 0) return null;
  return Math.round(powerW / Math.sqrt(massKg * cda));
}

export function computePstsSection(
  mapWatts: number,
  ftp: number | null,
  weightKg: number | null,
  cdaArgs: CdaArgs
): PstsResult | null {
  const cdaObj = computeCda(cdaArgs);
  if (!cdaObj || weightKg == null || weightKg <= 0) return null;
  const ftpUsed = ftp != null && ftp > 0 ? ftp : 0.75 * mapWatts;
  const mapPsts = computePsts(mapWatts, weightKg, cdaObj.cda);
  const ftpPsts = computePsts(ftpUsed, weightKg, cdaObj.cda);
  return {
    cda: cdaObj.cda,
    cdaMethod: cdaObj.method,
    frontalAreaM2: cdaObj.area,
    cdFactor: cdaObj.cdFactor,
    mapPsts,
    ftpPsts,
    ftpUsedForPsts: ftpUsed,
    summary:
      'PSTS increases with power, and decreases as mass or CdA increase. Think of it as a "power-to-speed potential" composite rather than a race result.',
  };
}

export function computeCompound(
  p5min: number | null,
  weightKg: number | null,
  sex: Sex | null
): CompoundResult | null {
  if (p5min == null || p5min <= 0 || weightKg == null || weightKg <= 0)
    return null;
  const score = (p5min * p5min) / weightKg;
  const sexScale = sex === "female" ? 0.85 : 1.0;
  const t1 = 900 * sexScale;
  const t2 = 1300 * sexScale;
  const t3 = 1700 * sexScale;
  let band: CompoundResult["band"];
  let bandText: string;
  if (score < t1) {
    band = "modest";
    bandText =
      "This is a relatively modest Compound Score; there is plenty of room to improve your aerobic engine and/or body composition.";
  } else if (score < t2) {
    band = "solid";
    bandText =
      "This is a solid Compound Score for many trained amateur riders.";
  } else if (score < t3) {
    band = "strong";
    bandText =
      "This is a very strong Compound Score, typical of high-level amateur or lower-tier elite riders depending on discipline.";
  } else {
    band = "exceptional";
    bandText =
      "This is an exceptional Compound Score and suggests very high aerobic capacity for your body mass.";
  }
  const u23Podium = 3110;
  const mastersPodium = 2000;
  const pctU23 = (score / u23Podium) * 100;
  const pctMasters = (score / mastersPodium) * 100;
  const benchText = ` Relative to rough benchmark values, your Compound Score is approximately ${pctU23.toFixed(0)}% of an elite U23 WorldTour podium level (~${u23Podium} W²/kg for males) and ${pctMasters.toFixed(0)}% of a strong masters (40–59) podium level (~${mastersPodium} W²/kg for males). These are based on historical race data and should be seen as high-performance reference points, not hard cut-offs.`;
  return {
    score,
    band,
    pctU23,
    pctMasters,
    summary: `Your Compound Score is ${score.toFixed(0)}. ${bandText}${benchText}`,
  };
}

function classifyVo2(vo2: number, sex: Sex | null): string | null {
  if (vo2 <= 0) return null;
  const bands = sex === "female" ? VO2_BANDS_FEMALE : VO2_BANDS_MALE;
  for (const b of bands) {
    if (vo2 >= b.low) return b.name;
  }
  return bands[bands.length - 1].name;
}

export function computeVo2(
  mapWatts: number,
  weightKg: number | null,
  sex: Sex | null,
  age: number | null,
  mastersFlag: boolean
): Vo2Result | null {
  if (weightKg == null || weightKg <= 0) return null;
  const vo2 = 7 + 9.8 * (mapWatts / weightKg);
  const baseCategory = classifyVo2(vo2, sex);
  let ageAdjusted: Vo2Result["ageAdjusted"] = null;
  const isMastersByAge = age != null && age >= 40 && age <= 80;
  if (isMastersByAge) {
    const factor = 1 + 0.01 * (age! - 40);
    const adjusted = vo2 * factor;
    ageAdjusted = { value: adjusted, category: classifyVo2(adjusted, sex) };
  }
  const riderLabel =
    sex === "male"
      ? "male cyclist"
      : sex === "female"
        ? "female cyclist"
        : "rider";
  let text = `Your estimated VO₂max from the ramp test and your mass is ${vo2.toFixed(1)} mL·kg⁻¹·min⁻¹. `;
  if (baseCategory) {
    text += `On standard adult reference tables (roughly ages 18–39), this would be classified as ${baseCategory} for a ${riderLabel}. `;
  }
  if (isMastersByAge) {
    text += `Because you're a masters rider (age ${age!.toFixed(0)}), it's useful to look at how this compares to younger-athlete norms. `;
    text += `When adjusted for typical age-related decline, your VO₂max is equivalent to about ${ageAdjusted!.value.toFixed(1)} mL·kg⁻¹·min⁻¹, which sits in the ${ageAdjusted!.category} band. `;
    const eliteWords =
      ageAdjusted!.category === "World Class" ||
      ageAdjusted!.category === "Exceptional"
        ? "truly elite"
        : "very strong";
    text += `In other words, for a masters rider your aerobic capacity is ${eliteWords} for your age. `;
  } else if (mastersFlag) {
    text += `For a masters rider, this value would already be considered strong for your age group, even without applying a formal age-equivalent adjustment. `;
  } else {
    text += `For context, VO₂max values in the high 50s and 60s are typical of strong competitive amateurs and national-level riders; 70+ is where you tend to see elite or world-class physiology.`;
  }
  return {
    ml_kg_min: vo2,
    baseCategory,
    ageAdjusted,
    isMastersByAge,
    summary: text.trim(),
  };
}

export function computeAllometric(
  mapWatts: number,
  weightKg: number | null,
  sex: Sex | null
): AllometricResult | null {
  if (weightKg == null || weightKg <= 0 || sex == null) return null;
  const mass67 = Math.pow(weightKg, 0.67);
  const wkg067 = mapWatts / mass67;
  const threshold = sex === "male" ? 29 : 21;
  const pctOfThreshold = (wkg067 / threshold) * 100;
  let msg = `Your allometric MAP is ${wkg067.toFixed(1)} W·kg⁻⁰·⁶⁷. `;
  msg += `That is about ${pctOfThreshold.toFixed(0)}% of a historic British Cycling talent ID benchmark (${threshold} W·kg⁻⁰·⁶⁷ for ${sex === "male" ? "men" : "women"}). `;
  if (pctOfThreshold >= 100) {
    msg +=
      "Historically, this would have placed you at or above the physiological standard used for GB squad selection when the ramp test was part of their pathway.";
  } else if (pctOfThreshold >= 80) {
    msg +=
      "This is very high and close to historic GB pathway standards; it represents strong aerobic potential.";
  } else {
    msg +=
      "This is below historic GB selection standards, but still a useful benchmark for tracking aerobic development over time.";
  }
  return { wkg067, threshold, pctOfThreshold, summary: msg };
}

function classifyTPProfile(
  sex: Sex,
  duration: "5s" | "1min" | "5min" | "FTP",
  wkg: number
): string | null {
  if (wkg <= 0) return null;
  const ranges = TP_PROFILE[sex][duration];
  for (const r of ranges) {
    if (wkg >= r.low) return r.name;
  }
  return ranges[ranges.length - 1].name;
}

export function computeTpProfile(
  mapWatts: number,
  weightKg: number | null,
  sex: Sex | null,
  p5s: number | null,
  p60: number | null,
  p5min: number | null,
  ftp: number | null
): { rows: TpProfileRow[]; categories: Record<string, string | null> } | null {
  if (!sex || weightKg == null || weightKg <= 0) return null;
  const rows: TpProfileRow[] = [];
  const cats: Record<string, string | null> = {};
  if (p5s != null && p5s > 0) {
    const wkg = p5s / weightKg;
    const cat = classifyTPProfile(sex, "5s", wkg);
    rows.push({ duration: "5s", wkg, category: cat });
    cats["5s"] = cat;
  }
  if (p60 != null && p60 > 0) {
    const wkg = p60 / weightKg;
    const cat = classifyTPProfile(sex, "1min", wkg);
    rows.push({ duration: "1min", wkg, category: cat });
    cats["1min"] = cat;
  }
  if (p5min != null && p5min > 0) {
    const wkg = p5min / weightKg;
    const cat = classifyTPProfile(sex, "5min", wkg);
    rows.push({ duration: "5min", wkg, category: cat });
    cats["5min"] = cat;
  }
  const ftpUsed = ftp != null && ftp > 0 ? ftp : 0.75 * mapWatts;
  if (ftpUsed > 0) {
    const wkg = ftpUsed / weightKg;
    const cat = classifyTPProfile(sex, "FTP", wkg);
    rows.push({ duration: "FTP", wkg, category: cat });
    cats["FTP"] = cat;
  }
  return rows.length ? { rows, categories: cats } : null;
}

export function computeRiderType(
  categories: Record<string, string | null> | null,
  mastersFlag: boolean
): RiderTypeResult | null {
  if (!categories) return null;
  const r5s = TP_RANK[categories["5s"] ?? ""] ?? null;
  const r60 = TP_RANK[categories["1min"] ?? ""] ?? null;
  const r5m = TP_RANK[categories["5min"] ?? ""] ?? null;
  const rFTP = TP_RANK[categories["FTP"] ?? ""] ?? null;
  const ranks = [r5s, r60, r5m, rFTP].filter((v) => v != null) as number[];
  if (ranks.length < 3) return null;
  const maxRank = Math.max(...ranks);
  const minRank = Math.min(...ranks);
  const spread = maxRank - minRank;
  const shortRanks = [r5s, r60].filter((v) => v != null) as number[];
  const longRanks = [r5m, rFTP].filter((v) => v != null) as number[];
  const avgShort = shortRanks.length
    ? shortRanks.reduce((a, b) => a + b, 0) / shortRanks.length
    : null;
  const avgLong = longRanks.length
    ? longRanks.reduce((a, b) => a + b, 0) / longRanks.length
    : null;
  let strongDownSlope = false;
  let strongUpSlope = false;
  if (avgShort != null && avgLong != null) {
    const diff = avgLong - avgShort;
    if (diff >= 1.0) strongUpSlope = true;
    else if (diff <= -1.0) strongDownSlope = true;
  }
  const isSprinter = strongDownSlope && r5s != null && r5s >= (r60 ?? r5s);
  const isTT =
    strongUpSlope &&
    ((rFTP != null && rFTP >= (r5s ?? 0)) ||
      (r5m != null && r5m >= (r5s ?? 0)));
  const isHorizontal = !strongDownSlope && !strongUpSlope && spread <= 2;
  let shape: RiderTypeResult["shape"];
  let label: string;
  let text: string;
  if (isSprinter) {
    shape = "down-sloping";
    label = 'sprinter / "fast-twitch"-leaning rider';
    text =
      'Your short-duration power categories (5 s / 60 s) sit above your longer-duration categories, characteristic of a sprinter or "fast-twitch"-leaning rider. You are relatively stronger in explosive, high-power efforts than in sustained aerobic work. Events such as track racing and criteriums often suit this pattern, provided your aerobic capacity is sufficient for race duration.';
  } else if (isTT) {
    shape = "up-sloping";
    label = "time-trialist / climber-leaning rider";
    text =
      "Your longer-duration power categories (5 min / FTP) sit above your short-duration categories, characteristic of a time-trialist or climber-leaning rider. You are relatively stronger in sustained aerobic efforts than in pure neuromuscular sprint power. Long TTs, hill climbs and steady breakaways tend to suit this pattern.";
  } else if (isHorizontal) {
    shape = "horizontal";
    label = "all-rounder";
    text =
      "Your profile is broadly horizontal across 5 s, 60 s, 5 min and threshold power, which is typical of an all-rounder. You may not be a pure specialist at any one duration, but you are relatively well-balanced and likely competitive across a range of event types at your level.";
  } else {
    shape = "mixed";
    label = "mixed profile";
    text =
      "Your profile does not clearly match a classical sprinter or time-trialist pattern. Instead it shows a more mixed distribution of strengths, which is very common in trained but non-elite riders, and is influenced both by natural abilities and by what you have emphasised in training. A full power-duration analysis and discussion of your race goals would refine how to best use your current abilities.";
  }
  if (mastersFlag) {
    text +=
      ' For masters athletes, it is normal for neuromuscular power and aerobic capacity to change at different rates with age, so applying the same profile standards "as is" still works but should be interpreted with that context in mind.';
  }
  return {
    shape,
    label,
    summary: `Overall, your power profile shape is best described as ${shape === "horizontal" ? "generally horizontal" : shape === "mixed" ? "mixed / uneven" : shape}, i.e. a ${label}. ${text}`,
  };
}

export function computeMapBand(
  mapWatts: number,
  weightKg: number | null,
  sex: Sex | null
): MapBandResult | null {
  if (weightKg == null || weightKg <= 0) return null;
  const wkg = mapWatts / weightKg;
  let band: string;
  if (sex === "female") {
    if (wkg < 3.3) band = "Untrained / recreational";
    else if (wkg < 4.3) band = "Trained amateur";
    else if (wkg < 5.0) band = "Competitive amateur";
    else if (wkg < 5.9) band = "Elite amateur / semi-pro";
    else band = "Professional-level";
  } else {
    if (wkg < 4.0) band = "Untrained / recreational";
    else if (wkg < 5.0) band = "Trained amateur";
    else if (wkg < 6.0) band = "Competitive amateur";
    else if (wkg < 7.5) band = "Elite amateur / semi-pro";
    else band = "Professional-level";
  }
  return { wkg, band };
}

export function computeTtEstimates(mapWatts: number): TtEstimateRow[] {
  return TT_EVENTS.map((ev) => ({
    distance: ev.name,
    lowW: Math.round(ev.low * mapWatts),
    highW: Math.round(ev.high * mapWatts),
    lowPct: Math.round(ev.low * 100),
    highPct: Math.round(ev.high * 100),
  }));
}

export function computeRaceEstimates(
  weightKg: number | null
): RaceEstimateRow[] | null {
  if (weightKg == null || weightKg <= 0) return null;
  const mass67 = Math.pow(weightKg, 0.67);
  return [
    {
      event: "road_race",
      label: "Road race (90+ min)",
      lowW: Math.round(11 * mass67),
      highW: Math.round(14 * mass67),
      wkg067Low: 11,
      wkg067High: 14,
    },
    {
      event: "crit",
      label: "Short criterium",
      lowW: Math.round(14 * mass67),
      highW: Math.round(18 * mass67),
      wkg067Low: 14,
      wkg067High: 18,
    },
  ];
}

export function computePowerProfile(
  inputs: ResolvedInputs
): PowerProfileResult {
  const mapWatts = inputs.mapWatts.value;
  if (mapWatts == null || mapWatts <= 0) {
    throw new Error(
      "MAP is required to compute the power profile (provide mapWatts or run a MAP ramp test)."
    );
  }
  const weight = inputs.weightKg.value;
  const ftp = inputs.ftpWatts.value;
  const sex = inputs.sex.value;
  const age = inputs.age.value;
  const heightCm = inputs.heightCm.value;
  const p5s = inputs.p5s.value;
  const p60 = inputs.p60.value;
  const p5min = inputs.p5min.value;
  const mastersFlag = inputs.masters.value === true;

  const tp = computeTpProfile(mapWatts, weight, sex, p5s, p60, p5min, ftp);

  return {
    inputs,
    zones: computeMapZones(mapWatts, p5s),
    ftpCheck: computeFtpCheck(mapWatts, ftp),
    psts: computePstsSection(mapWatts, ftp, weight, {
      heightCm,
      massKg: weight,
      position: inputs.aeroPosition.value,
      knownCda: inputs.cdaKnown.value,
    }),
    compound: computeCompound(p5min, weight, sex),
    vo2max: computeVo2(mapWatts, weight, sex, age, mastersFlag),
    allometricMap: computeAllometric(mapWatts, weight, sex),
    tpProfile: tp ? tp.rows : null,
    riderType: tp ? computeRiderType(tp.categories, mastersFlag) : null,
    mapBand: computeMapBand(mapWatts, weight, sex),
    ttEstimates: computeTtEstimates(mapWatts),
    raceEstimates: computeRaceEstimates(weight),
    source: {
      attribution:
        "Formulas, thresholds and narrative phrasing from cyclecoach.com/calculator (Ric Stern).",
      formulasFrom: "https://www.cyclecoach.com/calculator",
    },
  };
}
