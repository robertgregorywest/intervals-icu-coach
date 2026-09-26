/**
 * Capture live fixtures for the intensity-distribution service.
 *
 * Mirrors the trimmed `{ activity, event }` shape the session-review fixtures
 * already use, and adds the `watts` stream the band lens buckets. Run only when
 * a fixture needs refreshing against live data — the committed files are the
 * test inputs, not this script's output path.
 *
 *   npx tsx scripts/capture-intensity-fixtures.ts
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "../src/index.js";

const CASES: Array<{ name: string; activityId?: string; eventId?: number }> = [
  // The clean paired case: structured SST, head unit, intervals that align.
  { name: "sweet-spot-3x12", activityId: "i170317118" },
  // Defeats step alignment (coarse auto-detected intervals), and doubles as the
  // paused case — 3322 samples against 7169 s elapsed.
  { name: "track-session", activityId: "i171371339" },
  // No recorded power at all: streams come back as an empty map.
  { name: "no-power", activityId: "i170871150" },
];

const client = createClient({
  apiKey: process.env.INTERVALS_API_KEY!,
  athleteId: process.env.INTERVALS_ATHLETE_ID ?? "0",
});

const outDir = resolve(
  import.meta.dirname,
  "../tests/fixtures/intensity-distribution"
);
mkdirSync(outDir, { recursive: true });

type Fixture = {
  activity: Record<string, unknown>;
  event?: Record<string, unknown>;
  streams: { watts?: unknown };
};
const captured = new Map<string, Fixture>();

for (const c of CASES) {
  const activity = await client.activities.getActivity(c.activityId!, true);
  const eventId = c.eventId ?? activity.paired_event_id;
  const event = eventId ? await client.events.getEvent(eventId) : undefined;
  const streams = (await client.activities.getActivityStreams(c.activityId!, [
    "watts",
  ])) as Record<string, unknown>;

  const fixture = {
    activity: {
      id: activity.id,
      name: activity.name,
      type: activity.type,
      start_date_local: activity.start_date_local,
      paired_event_id: activity.paired_event_id,
      compliance: (activity as Record<string, unknown>).compliance,
      icu_training_load: activity.icu_training_load,
      icu_ftp: activity.icu_ftp,
      moving_time: activity.moving_time,
      elapsed_time: (activity as Record<string, unknown>).elapsed_time,
      icu_recording_time: (activity as Record<string, unknown>)
        .icu_recording_time,
    },
    event: event
      ? {
          id: event.id,
          name: event.name,
          category: event.category,
          type: event.type,
          start_date_local: event.start_date_local,
          icu_training_load: event.icu_training_load,
          icu_ftp: event.icu_ftp,
          moving_time: event.moving_time,
          workout_doc: event.workout_doc,
        }
      : undefined,
    streams: { watts: streams.watts ?? undefined },
  };

  writeFixture(c.name, fixture);
  const watts = streams.watts as number[] | undefined;
  console.log(
    `${c.name}: ${watts?.length ?? 0} watt samples, ` +
      `${event?.workout_doc?.steps?.length ?? 0} planned steps`
  );
  captured.set(c.name, fixture);
}

/**
 * Composed, not captured: on this account the two dead ends co-occur — every
 * event with an empty `workout_doc.steps` is a strength session, which also has
 * no power. Pairing a real powered activity with a real empty workout doc lets
 * the two be tested apart. Same precedent as the hand-authored fixtures under
 * `tests/fixtures/session-review/`.
 */
const powered = captured.get("sweet-spot-3x12")!;
const emptyDoc = captured.get("no-power")!;
writeFixture("no-structured-steps", {
  ...powered,
  event: { ...powered.event!, workout_doc: emptyDoc.event?.workout_doc },
});
console.log("no-structured-steps: composed from the two above");

// The zone frame the fixtures are bucketed against, so tests stay hermetic
// rather than depending on the athlete's MAP moving.
const ctx = await client.coachingContext.getCoachingContext();
writeFixture("coaching-zones", {
  ftp: ctx.athlete.ftp,
  map: ctx.map,
  mapZones: ctx.mapZones,
} as unknown as Fixture);
console.log(`coaching-zones: FTP ${ctx.athlete.ftp}, MAP ${ctx.map?.watts}`);

function writeFixture(name: string, fixture: unknown): void {
  // The watt stream goes on one line: a fixture with 4000 numbers one per line
  // is unreviewable in a diff, and the array is opaque either way.
  const json = JSON.stringify(fixture, null, 2).replace(
    /"watts": \[[^\]]*\]/s,
    (m) => m.replace(/\s+/g, " ")
  );
  writeFileSync(resolve(outDir, `${name}.json`), `${json}\n`);
}
