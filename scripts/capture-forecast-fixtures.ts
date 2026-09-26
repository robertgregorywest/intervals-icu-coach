/**
 * Capture the live oracle for the training-load-forecast service: a run of
 * delivered wellness records, the athlete's time constants, and the planned
 * events over the same window.
 *
 * The committed files under `tests/fixtures/training-load-forecast/` are the
 * test inputs, not this script's output path. Read-only — it writes nothing to
 * Intervals.icu.
 *
 *   npx tsx scripts/capture-forecast-fixtures.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "../src/index.js";
import type { SportSetting } from "../src/services/athlete/index.js";

/** A long enough run that the 42-day fitness constant is exercised, not just ATL. */
const OLDEST = "2026-05-01";
const NEWEST = "2026-08-20";

const client = createClient({
  apiKey: process.env.INTERVALS_API_KEY!,
  athleteId: process.env.INTERVALS_ATHLETE_ID ?? "0",
});

const outDir = resolve(
  import.meta.dirname,
  "../tests/fixtures/training-load-forecast"
);
mkdirSync(outDir, { recursive: true });

const [wellness, events, athlete] = await Promise.all([
  client.wellness.getWellness(OLDEST, NEWEST),
  client.events.getEvents(OLDEST, NEWEST),
  client.athlete.getAthlete(),
]);

const raw = athlete as unknown as {
  sport_settings?: SportSetting[];
  sportSettings?: SportSetting[];
  ftp?: number;
  icu_ftp?: number;
};
const cycling = (raw.sport_settings ?? raw.sportSettings ?? []).find((s) =>
  (s.types ?? []).some((t) => /ride|cycl|bike/i.test(t))
);

writeFileSync(
  resolve(outDir, "wellness.json"),
  `${JSON.stringify(
    {
      harvest: {
        script: "scripts/capture-forecast-fixtures.ts",
        command: "npx tsx scripts/capture-forecast-fixtures.ts",
        endpoints: [
          "GET /api/v1/athlete/{id}/wellness?oldest&newest",
          "GET /api/v1/athlete/{id}/events?oldest&newest",
        ],
        capturedAt: new Date().toISOString().slice(0, 10),
        window: { oldest: OLDEST, newest: NEWEST },
        timeConstants: {
          // Null on this athlete's settings, so the platform defaults apply.
          // Captured rather than assumed: the forecast reads them per athlete.
          ctlDays:
            (cycling as Record<string, unknown> | undefined)?.ctl_days ?? null,
          atlDays:
            (cycling as Record<string, unknown> | undefined)?.atl_days ?? null,
        },
        ftp: raw.ftp ?? raw.icu_ftp ?? cycling?.ftp ?? null,
        note:
          "Delivered fitness and fatigue, one record per day. `ctlLoad` and " +
          "`atlLoad` are the day's training load as the platform fed it into " +
          "each recursion; `ctl`/`atl` are the result. A forecast seeded from " +
          "one record must reproduce the rest of the series from the loads alone.",
      },
      /** Trimmed to the fields the recursion and its ramp use. */
      records: wellness.map((w) => ({
        date: w.id,
        ctl: w.ctl,
        atl: w.atl,
        ctlLoad: w.ctlLoad,
        atlLoad: w.atlLoad,
        rampRate: w.rampRate,
      })),
      /** Planned work over the same window, for the merge and roll-up paths. */
      events: events.map((e) => ({
        id: e.id,
        name: e.name,
        date: e.start_date_local.slice(0, 10),
        type: e.type,
        category: e.category,
        icu_training_load: e.icu_training_load,
        moving_time: e.moving_time,
        description: e.description,
        workout_doc: e.workout_doc
          ? { steps: e.workout_doc.steps, duration: e.workout_doc.duration }
          : undefined,
      })),
    },
    null,
    2
  )}\n`
);

console.log(
  `wellness.json: ${wellness.length} records, ${events.length} events, ` +
    `FTP ${raw.ftp ?? cycling?.ftp}`
);
