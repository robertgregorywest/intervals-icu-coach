/**
 * Capture one real result for every Tool that declares an `outputSchema`, so
 * `tests/tool-outputs.test.ts` can hold each schema against what the Tool
 * actually returns (issue #56).
 *
 * Reads go to Intervals.icu live; writes go through the cassette's recording
 * fetch, so they are captured and answered with an echo, never sent. Each
 * Tool runs as an adapter runs it — args parsed with its schema first — and a
 * result its own schema rejects is reported, not saved. Run only when a
 * fixture needs refreshing; the committed files are the test inputs.
 *
 * The repo is public, so health and body readings, the athlete's name and
 * local paths are redacted before saving. A redacted value keeps its type, so
 * the schema still sees the shape the Tool returned.
 *
 *   npx tsx scripts/capture-tool-outputs.ts
 */
import "dotenv/config";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServices } from "../src/index.js";
import { recordingFetch } from "../src/cassette.js";
import { TOOLS } from "../src/registry.js";

const scratch = mkdtempSync(join(tmpdir(), "capture-tool-outputs-"));
const RIDE = "i192509523";
const TRACK_SESSION = "2026-09-06-bmrc-ip";

const ARGS: Record<string, Record<string, unknown>> = {
  get_activities: { oldest: "2026-09-26", newest: "2026-10-03", limit: 5 },
  get_activity_laps: { id: RIDE },
  get_events: { oldest: "2026-10-01", newest: "2026-10-04" },
  delete_events: { ids: [{ id: 137474983 }] },
  create_workout: {
    name: "Endurance",
    date: "2026-10-10",
    sportType: "Ride",
    steps: [{ label: "Easy", duration: "40m", target: "125w-165w" }],
  },
  schedule_library_workout: { id: 14, date: "2026-10-10" },
  create_strength_workout: {
    name: "Strength",
    date: "2026-10-10",
    description: "Back squat 3x5\nRomanian deadlift 3x8",
  },
  list_workout_library: {},
  sync_workout_library: {},
  delete_workout_library_item: { id: 14 },
  get_wellness: { oldest: "2026-09-26", newest: "2026-10-03" },
  get_aerobic_decoupling: { activityId: RIDE },
  compare_intervals: { activityIds: [RIDE, "i170317118"] },
  compare_planned_vs_actual: { activityId: RIDE },
  compare_intensity_distribution: { activityId: RIDE },
  get_execution_digest: { oldest: "2026-09-21", newest: "2026-10-03" },
  compute_track_lap_power: { sessionId: TRACK_SESSION },
  write_track_runs: { sessionId: TRACK_SESSION },
  create_drivetrain_speed_fit: {
    sessionId: TRACK_SESSION,
    gear: "65x16",
    outputPath: join(scratch, "drivetrain-speed.fit"),
  },
  list_track_sessions: {},
  get_track_session: { id: TRACK_SESSION },
  compare_track_sessions: {
    runs: ["2026-07-12-training#run-1", "2026-07-12-training#run-2"],
  },
  get_training_week_summary: { weekStart: "2026-09-28" },
  get_middle_band_trend: { oldest: "2026-08-03", newest: "2026-10-03" },
  get_coaching_context: {},
  forecast_training_load: { oldest: "2026-10-03", newest: "2026-10-17" },
};

/** Wellness, body and health readings — not needed to check a shape. */
const PRIVATE_KEYS = new Set([
  "abdomen",
  "avgSleepingHR",
  "baevskySI",
  "bloodGlucose",
  "bodyFat",
  "carbohydrates",
  "comments",
  "diastolic",
  "fatTotal",
  "fatigue",
  "hrv",
  "hrvSDNN",
  "hydration",
  "hydrationVolume",
  "icu_resting_hr",
  "icu_weight",
  "injury",
  "kcalConsumed",
  "lactate",
  "menstrualPhase",
  "menstrualPhasePredicted",
  "mood",
  "motivation",
  "power_meter_serial",
  "protein",
  "readiness",
  "respiration",
  "restingHR",
  "resting_hr",
  "sleepQuality",
  "sleepScore",
  "sleepSecs",
  "sleep_score",
  "sleep_secs",
  "soreness",
  "spO2",
  "stress",
  "systolic",
  "tempRestingHR",
  "tempWeight",
  "vo2max",
  "weight",
]);
const REPO_ROOT = resolve(import.meta.dirname, "..");

function placeholder(value: unknown): unknown {
  if (typeof value === "number") return 0;
  if (typeof value === "string") return "redacted";
  return value;
}

function redact(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) return value.map((v) => redact(v, parentKey));
  if (typeof value === "string") return value.replaceAll(REPO_ROOT, ".");
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [
      k,
      PRIVATE_KEYS.has(k) || (parentKey === "athlete" && k === "name")
        ? placeholder(v)
        : redact(v, k),
    ])
  );
}

const services = createServices({
  apiKey: process.env.INTERVALS_API_KEY!,
  athleteId: process.env.INTERVALS_ATHLETE_ID ?? "0",
  fetchFn: recordingFetch({
    dir: join(scratch, "cassette"),
    captureFile: join(scratch, "writes.jsonl"),
  }),
});

const outDir = resolve(import.meta.dirname, "../tests/fixtures/tool-outputs");
mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const tool of TOOLS.filter((t) => t.outputSchema)) {
  const raw = ARGS[tool.name];
  if (!raw) {
    console.error(`${tool.name}: no sample args — add them to ARGS`);
    failed++;
    continue;
  }
  try {
    const args = tool.schema.parse(raw);
    const output = await tool.handler(services, args);
    const checked = tool.outputSchema!.safeParse(output);
    if (!checked.success) {
      console.error(`${tool.name}: output fails its schema\n${checked.error}`);
      failed++;
      continue;
    }
    writeFileSync(
      join(outDir, `${tool.name}.json`),
      JSON.stringify({ args: raw, output: redact(output) }, null, 2) + "\n"
    );
    console.log(`${tool.name}: ok`);
  } catch (error) {
    console.error(`${tool.name}: ${(error as Error).message}`);
    failed++;
  }
}

console.log(`Writes captured, not sent: ${join(scratch, "writes.jsonl")}`);
process.exit(failed ? 1 : 0);
