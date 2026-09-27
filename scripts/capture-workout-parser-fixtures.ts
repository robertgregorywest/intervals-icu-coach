/**
 * Capture the live oracle for the workout-parser and training-load-forecast
 * services: every planned event that carries Intervals.icu's own parse of its
 * description, alongside the figures the platform derived from that parse.
 *
 * The committed `tests/fixtures/workout-parser/events.json` is the test input,
 * not this script's output path — re-run it deliberately and review the diff,
 * the same way `tests/fixtures/rendered-templates.txt` is refreshed.
 *
 *   npx tsx scripts/capture-workout-parser-fixtures.ts
 *   npx tsx scripts/capture-workout-parser-fixtures.ts --zones
 *
 * `--zones` additionally refreshes `zone-targets.json`, the oracle for how
 * Intervals.icu resolves a `ZN` target in workout text. There is no read-only
 * route to it — the platform only reveals a resolved target on an event it has
 * parsed — so the flag writes one throwaway event per zone far in the future,
 * reads the figures back, and deletes them. Opt-in, because the default harvest
 * writes nothing.
 *
 * The whole capture is committed, unfiltered. An assertion that needs a
 * threshold must find it in the fixture rather than reaching for live state, so
 * each entry carries `loadBasis` (see below) and its own `ftpUsed`.
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServices } from "../src/index.js";
import type { PlannedDocStep, WorkoutDoc } from "../src/types.js";
import type { SportSetting } from "../src/services/athlete/index.js";

/** Harvest window. Widened rather than narrowed — a bigger corpus is a better oracle. */
const OLDEST = "2025-01-01";
const NEWEST = "2026-12-31";

const services = createServices({
  apiKey: process.env.INTERVALS_API_KEY!,
  athleteId: process.env.INTERVALS_ATHLETE_ID ?? "0",
});

const outDir = resolve(import.meta.dirname, "../tests/fixtures/workout-parser");
mkdirSync(outDir, { recursive: true });

const [events, athlete] = await Promise.all([
  services.events.getEvents(OLDEST, NEWEST),
  services.athlete.getAthlete(),
]);

/**
 * The athlete's FTP-anchored power zones, which is the frame Intervals.icu
 * resolves a `Z2` target in workout text against. Recorded for reference, not
 * asserted against: zone resolution to watts is unit-tested at a threshold the
 * test chooses, because no event records the threshold it was resolved at.
 */
const raw = athlete as unknown as {
  sport_settings?: SportSetting[];
  sportSettings?: SportSetting[];
  icu_ftp?: number;
  ftp?: number;
};
const cycling = (raw.sport_settings ?? raw.sportSettings ?? []).find((s) =>
  (s.types ?? []).some((t) => /ride|cycl|bike/i.test(t))
);
const ftpAtHarvest = raw.ftp ?? raw.icu_ftp ?? cycling?.ftp ?? null;

const entries = events
  .filter((e) => (e.workout_doc?.steps?.length ?? 0) > 0)
  .map((e) => {
    const doc = e.workout_doc as WorkoutDoc & {
      normalized_power?: number;
      average_watts?: number;
    };
    const intensity = (e as Record<string, unknown>).icu_intensity as
      number | undefined;
    const np = doc.normalized_power;

    return {
      id: e.id,
      name: e.name,
      date: e.start_date_local.slice(0, 10),
      type: e.type,
      description: e.description,
      // Only the fields a parse is judged on. `zoneTimes`, `strain_score` and
      // the colour tables the platform also returns would triple the file
      // without adding an assertion.
      workout_doc: {
        steps: doc.steps,
        duration: doc.duration,
        distance: doc.distance,
      },
      normalized_power: np,
      average_watts: doc.average_watts,
      icu_training_load: e.icu_training_load,
      moving_time: e.moving_time,
      icu_intensity: intensity,
      /**
       * The FTP this event's load was computed against, recovered from the
       * platform's own `icu_intensity` (`IF = NP / FTP`). The event does not
       * record its FTP — `icu_ftp` is null throughout — and a `%ftp`-anchored
       * prescription was resolved at whatever threshold was on file the day it
       * was authored. Recording it here keeps the load assertion inside the
       * fixture instead of reaching for the athlete's current threshold.
       */
      ftpUsed:
        np !== undefined && intensity !== undefined && intensity > 0
          ? Math.round((np / intensity) * 100)
          : undefined,
      loadBasis: classify(doc.steps),
    };
  })
  .sort((a, b) => a.date.localeCompare(b.date) || (a.id ?? 0) - (b.id ?? 0));

/**
 * How much of the entry reproduces without a threshold.
 *
 * - `threshold-free`   — every powered step prescribes absolute watts, so both
 *   the parse and the derived normalised power reproduce under any threshold.
 *   These are the entries the load fidelity test asserts against.
 * - `threshold-dependent` — at least one step is anchored to `%ftp` or a power
 *   zone, so its wattage moved when the athlete's threshold moved.
 * - `unpowered` — no step carries a power target at all; nothing to derive.
 */
function classify(
  steps: PlannedDocStep[] | undefined
): "threshold-free" | "threshold-dependent" | "unpowered" {
  const flat = flatten(steps ?? []);
  const powered = flat.filter((s) => s.power !== undefined);
  if (powered.length === 0) return "unpowered";
  // A step with no target at all is as unresolvable as a percent one: the
  // stream cannot be built from it, so the entry is not threshold-free.
  if (powered.length < flat.length) return "threshold-dependent";
  const allWatts = powered.every((s) => {
    const u = (s.power?.units ?? "w").toLowerCase();
    return u === "w" || u === "watts";
  });
  return allWatts ? "threshold-free" : "threshold-dependent";
}

function flatten(steps: PlannedDocStep[]): PlannedDocStep[] {
  return steps.flatMap((s) =>
    Array.isArray(s.steps) ? flatten(s.steps) : [s]
  );
}

const counts = entries.reduce<Record<string, number>>((acc, e) => {
  acc[e.loadBasis] = (acc[e.loadBasis] ?? 0) + 1;
  return acc;
}, {});

const fixture = {
  harvest: {
    script: "scripts/capture-workout-parser-fixtures.ts",
    command: "npx tsx scripts/capture-workout-parser-fixtures.ts",
    endpoint: "GET /api/v1/athlete/{id}/events?oldest&newest",
    capturedAt: new Date().toISOString().slice(0, 10),
    window: { oldest: OLDEST, newest: NEWEST },
    athleteFtpAtHarvest: ftpAtHarvest,
    athletePowerZonesAtHarvest: cycling?.power_zones ?? null,
    eventsInWindow: events.length,
    entries: entries.length,
    loadBasisCounts: counts,
    note:
      "Every planned event in the window carrying a parsed workout_doc, " +
      "unfiltered. `workout_doc` is Intervals.icu's own parse of `description` " +
      "and is the oracle for the local parser; `normalized_power` and " +
      "`average_watts` come from that same document. `ftpUsed` is recovered " +
      "from `icu_intensity`, because no event records the threshold it was " +
      "resolved at. Re-harvest by re-running the command above and reviewing " +
      "the diff.",
  },
  entries,
};

writeFileSync(
  resolve(outDir, "events.json"),
  `${JSON.stringify(fixture, null, 2)}\n`
);

console.log(
  `events.json: ${entries.length} entries from ${events.length} events ` +
    `(${JSON.stringify(counts)}), FTP at harvest ${ftpAtHarvest}`
);

if (process.argv.includes("--zones")) {
  await captureZoneTargets();
}

/**
 * Write one single-step event per zone, read back the platform's own
 * `average_watts` for it — which for a single constant step *is* the resolved
 * target — and delete them again. The percentage control alongside is what
 * shows the zone path is not the percentage path: `Z6` and `120-150%` do not
 * land on the same wattage.
 */
async function captureZoneTargets(): Promise<void> {
  const date = "2027-12-01";
  const zones = cycling?.power_zones ?? [];
  const probes = [
    ...zones.map((_, i) => ({
      key: `Z${i + 1}`,
      description: `- 60m Z${i + 1}`,
    })),
    { key: "55-75%", description: "- 60m 55-75%" },
    { key: "120-150%", description: "- 60m 120-150%" },
  ];
  const drafts = probes.map((p) => ({
    category: "WORKOUT" as const,
    start_date_local: `${date}T00:00:00`,
    type: "Ride" as const,
    name: `zone-target probe ${p.key}`,
    description: p.description,
    external_id: `zone-target-probe-${p.key.replace(/[^a-z0-9]+/gi, "-")}`,
  }));

  let written: Array<{ id?: number; name: string; doc?: unknown }> = [];
  try {
    await services.events.createEvents(drafts);
    const back = (await services.events.getEvents(date, date)).filter((e) =>
      e.name.startsWith("zone-target probe ")
    );
    written = back.map((e) => ({ id: e.id, name: e.name, doc: e.workout_doc }));

    const targets: Record<string, number | undefined> = {};
    for (const e of back) {
      const key = e.name.replace("zone-target probe ", "");
      targets[key] = (e.workout_doc as { average_watts?: number } | undefined)
        ?.average_watts;
    }

    writeFileSync(
      resolve(outDir, "zone-targets.json"),
      `${JSON.stringify(
        {
          harvest: {
            script: "scripts/capture-workout-parser-fixtures.ts --zones",
            capturedAt: new Date().toISOString().slice(0, 10),
            method:
              "One throwaway single-step event per zone, written to " +
              `${date}, read back, and deleted. For a single constant step the ` +
              "platform's `average_watts` is the resolved target in watts.",
            ftp: ftpAtHarvest,
            powerZones: zones,
            note:
              "The two percentage controls show the zone path is not the " +
              "percentage path: Z2 and 55-75% agree, Z6 and 120-150% do not, " +
              "because the zone path converts each bound to watts before " +
              "taking the midpoint.",
          },
          targets,
        },
        null,
        2
      )}\n`
    );
    console.log(`zone-targets.json: ${JSON.stringify(targets)}`);
  } finally {
    const ids = written
      .map((e) => e.id)
      .filter((id): id is number => typeof id === "number");
    if (ids.length > 0) {
      await services.events.deleteEvents(ids.map((id) => ({ id })));
      console.log(`zone probes deleted: ${ids.length}`);
    }
  }
}
