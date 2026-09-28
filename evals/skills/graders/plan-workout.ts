import { z } from "zod";
import {
  createWorkoutParser,
  type ParseAnchors,
  type ParsedWorkout,
} from "../../../src/services/workout-parser/index.js";
import type { ZoneRow } from "../../../src/services/power-profile/index.js";
import type { PlannedDocStep } from "../../../src/types.js";
import { defineGrader, isoDate } from "../lib/grader.js";
import { scenarioServices } from "../lib/scenario-services.js";
import type { GradeOutcome, RunArtifacts } from "../lib/types.js";

const parser = createWorkoutParser();

/** Options every plan-workout grader takes: which workout, which anchors. */
const workoutOptions = {
  /** Only the workout on this day. */
  date: isoDate.optional(),
  /** Override the athlete's FTP / power zones from the cassette. */
  ftp: z.number().optional(),
  powerZones: z.array(z.number()).optional(),
  /** Sport settings to anchor against; Ride by default. */
  sport: z.string().optional(),
};
type WorkoutOptions = {
  date?: string;
  ftp?: number;
  powerZones?: number[];
  sport?: string;
};

/** A workout the run wrote to the calendar, parsed as the platform would. */
interface WrittenWorkout {
  label: string;
  parsed: ParsedWorkout;
}

const EVENT_WRITE = /\/events(\/bulk|\/\d+)?$/;

/**
 * Every workout text the run wrote as a calendar event — POST, bulk POST or
 * PUT — optionally only those on `date:`. Library writes (`/workouts`) are
 * not calendar workouts and are left out.
 */
function writtenWorkouts(
  o: WorkoutOptions,
  run: RunArtifacts,
  anchors: ParseAnchors
): WrittenWorkout[] {
  const out: WrittenWorkout[] = [];
  for (const w of run.writes) {
    if (w.method === "DELETE" || !EVENT_WRITE.test(w.path)) continue;
    const items = Array.isArray(w.body) ? w.body : [w.body];
    for (const item of items as Array<Record<string, unknown> | null>) {
      if (typeof item?.description !== "string") continue;
      const start = String(item.start_date_local ?? "");
      if (o.date && start && !start.startsWith(o.date)) continue;
      out.push({
        label: `${w.method} ${String(item.name ?? "workout")}${start ? ` on ${start.slice(0, 10)}` : ""}`,
        parsed: parser.parse(item.description, anchors),
      });
    }
  }
  return out;
}

interface SportSettingsLike {
  types: string[];
  ftp?: number | null;
  power_zones?: number[] | null;
}

/**
 * FTP and power zones to resolve `%` and `Z` targets against: the case's own
 * `ftp:`/`powerZones:` when given, else the athlete's `sport:` settings as
 * the scenario's `get_athlete` returns them.
 */
async function anchorsFor(
  o: WorkoutOptions,
  run: RunArtifacts
): Promise<ParseAnchors> {
  if (o.ftp !== undefined) {
    return { ftp: o.ftp, powerZones: o.powerZones ?? null };
  }
  const sport = o.sport ?? "Ride";
  const athlete = await scenarioServices(run.evalCase).athlete.getAthlete();
  // The platform returns `sportSettings`; the type still names the old key.
  const settings = (athlete["sportSettings"] ??
    athlete.sport_settings ??
    []) as SportSettingsLike[] | undefined;
  const s = settings?.find((x) => x.types.includes(sport));
  return s ? { ftp: s.ftp ?? null, powerZones: s.power_zones ?? null } : {};
}

async function workoutsFor(
  o: WorkoutOptions,
  run: RunArtifacts
): Promise<WrittenWorkout[]> {
  return writtenWorkouts(o, run, await anchorsFor(o, run));
}

/** Leaf steps with repeats expanded into a multiplier on their time. */
function leafSteps(
  steps: PlannedDocStep[] | undefined,
  reps = 1
): Array<{ step: PlannedDocStep; reps: number }> {
  return (steps ?? []).flatMap((s) =>
    Array.isArray(s.steps)
      ? leafSteps(s.steps, reps * (s.reps ?? 1))
      : [{ step: s, reps }]
  );
}

function minutes(seconds: number): string {
  const m = seconds / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}

function watts(lo: number, hi: number): string {
  return lo === hi ? `${lo} W` : `${lo}–${hi} W`;
}

function noWorkout(o: WorkoutOptions): GradeOutcome {
  return {
    passed: false,
    explanation: `no workout written${o.date ? ` on ${o.date}` : ""}`,
  };
}

/**
 * Each written workout parses into at least one step with no line the
 * platform would drop.
 */
export const workoutParses = defineGrader(
  z.strictObject(workoutOptions),
  async (o, run) => {
    const workouts = await workoutsFor(o, run);
    if (workouts.length === 0) return noWorkout(o);
    const problems = workouts.flatMap(({ label, parsed }) => [
      ...(parsed.doc.steps?.length ? [] : [`${label}: no steps`]),
      ...parsed.discarded.map(
        (d) => `${label}: line ${d.line} "${d.text}" dropped (${d.reason})`
      ),
    ]);
    return {
      passed: problems.length === 0,
      explanation: problems.length
        ? problems.join("; ")
        : `${workouts.length} workout(s) parse cleanly`,
    };
  }
);

const ZONE_NAMES = [
  "REC",
  "L1",
  "L2",
  "L3",
  "L4",
  "L5",
  "L6",
  "L7",
  "NMP",
] as const satisfies readonly ZoneRow["name"][];

/**
 * The watt band for `zone:` — one MAP zone, or `[from, to]` spanning several
 * — from the mapZones the scenario's coaching context carries on its date.
 */
async function zoneBand(
  zone: ZoneRow["name"] | [ZoneRow["name"], ZoneRow["name"]],
  run: RunArtifacts
): Promise<{ band: [number, number]; label: string }> {
  const [from, to] = Array.isArray(zone) ? zone : [zone, zone];
  const ctx = await scenarioServices(
    run.evalCase
  ).coachingContext.getCoachingContext();
  if (!ctx.mapZones) {
    throw new Error(`no mapZones on ${ctx.asOf}: ${ctx.mapWarning ?? ""}`);
  }
  const low = ctx.mapZones.find((z) => z.name === from);
  const high = ctx.mapZones.find((z) => z.name === to);
  if (!low || !high) throw new Error(`mapZones lack ${from}/${to}`);
  return {
    band: [low.lowW, high.highW],
    label: from === to ? `MAP ${from}` : `MAP ${from}–${to}`,
  };
}

/**
 * The work steps — those whose target reaches `workAbove` W (default 90% of
 * the band's floor) — all sit inside the band (± `tolerance` W). The band is
 * a MAP zone (`zone: L4`, or `zone: [L3, L4]`) resolved from the scenario's
 * mapZones, or explicit watts (`band: [lowW, highW]`) for an intent the
 * zones don't draw, such as a %FTP prescription. With `workMinutes`, the
 * work's total time is also bounded — what tells a trimmed 2×15 from a full
 * 2×20 at the same watts.
 */
export const targetsInBand = defineGrader(
  z
    .strictObject({
      ...workoutOptions,
      zone: z
        .union([
          z.enum(ZONE_NAMES),
          z.tuple([z.enum(ZONE_NAMES), z.enum(ZONE_NAMES)]),
        ])
        .optional(),
      band: z.tuple([z.number(), z.number()]).optional(),
      tolerance: z.number().optional(),
      workAbove: z.number().optional(),
      workMinutes: z
        .strictObject({
          min: z.number().optional(),
          max: z.number().optional(),
        })
        .optional(),
    })
    .refine((o) => (o.zone === undefined) !== (o.band === undefined), {
      message: "give exactly one of zone: or band:",
    }),
  async (o, run) => {
    const { band, label: bandLabel } = o.zone
      ? await zoneBand(o.zone, run)
      : { band: o.band!, label: "" };
    const [lowW, highW] = band.map(Math.round);
    const bandText = `${bandLabel ? `${bandLabel} ` : ""}${lowW}–${highW} W`;
    const tolerance = o.tolerance ?? 0;
    const workAbove = o.workAbove ?? lowW * 0.9;
    const anchors = await anchorsFor(o, run);
    const workouts = writtenWorkouts(o, run, anchors);
    if (workouts.length === 0) return noWorkout(o);

    const problems: string[] = [];
    const summaries: string[] = [];
    for (const { label, parsed } of workouts) {
      let workSeconds = 0;
      let hardest: { name: string; lo: number; hi: number } | null = null;
      for (const { step, reps } of leafSteps(parsed.doc.steps)) {
        if (!step.power) continue;
        const stepName = step.text
          ? `"${step.text}"`
          : `${minutes(step.duration ?? 0)} step`;
        const { target, unresolved } = parser.resolvePower(
          step.power,
          anchors,
          step.ramp
        );
        if (!target) {
          problems.push(`${label}: ${stepName} ${unresolved ?? "no target"}`);
          continue;
        }
        const lo = Math.round(target.low ?? target.watts ?? 0);
        const hi = Math.round(target.high ?? target.watts ?? 0);
        if (!hardest || lo + hi > hardest.lo + hardest.hi) {
          hardest = { name: stepName, lo, hi };
        }
        if ((lo + hi) / 2 < workAbove) continue;
        workSeconds += (step.duration ?? 0) * reps;
        if (lo < lowW - tolerance || hi > highW + tolerance) {
          problems.push(
            `${label}: ${stepName} at ${watts(lo, hi)}, outside ${bandText}`
          );
        }
      }
      if (workSeconds === 0) {
        // Nothing reached the band: the workout is too easy for the intent.
        problems.push(
          `${label}: no work in ${bandText}${hardest ? ` — hardest step ${hardest.name} at ${watts(hardest.lo, hardest.hi)}` : ""}`
        );
        continue;
      }
      const workMin = workSeconds / 60;
      const { min, max } = o.workMinutes ?? {};
      if (min !== undefined && workMin < min) {
        problems.push(
          `${label}: ${minutes(workSeconds)} of work, under ${min}m`
        );
      }
      if (max !== undefined && workMin > max) {
        problems.push(
          `${label}: ${minutes(workSeconds)} of work, over ${max}m`
        );
      }
      summaries.push(`${label}: ${minutes(workSeconds)} of work`);
    }
    return {
      passed: problems.length === 0,
      explanation: problems.length
        ? problems.join("; ")
        : `work in ${bandText} — ${summaries.join("; ")}`,
    };
  }
);

/** Each written workout's total time is within `minMinutes`–`maxMinutes`. */
export const durationWithin = defineGrader(
  z.strictObject({
    ...workoutOptions,
    minMinutes: z.number().optional(),
    maxMinutes: z.number().optional(),
  }),
  async (o, run) => {
    const min = o.minMinutes ?? 0;
    const max = o.maxMinutes ?? Infinity;
    const workouts = await workoutsFor(o, run);
    if (workouts.length === 0) return noWorkout(o);
    const problems: string[] = [];
    const totals: string[] = [];
    for (const { label, parsed } of workouts) {
      const seconds = parsed.doc.duration ?? 0;
      totals.push(`${label}: ${minutes(seconds)}`);
      if (seconds / 60 < min || seconds / 60 > max) {
        problems.push(
          `${label}: ${minutes(seconds)}, outside ${min}–${max === Infinity ? "∞" : max}m`
        );
      }
    }
    return {
      passed: problems.length === 0,
      explanation: problems.length ? problems.join("; ") : totals.join("; "),
    };
  }
);
