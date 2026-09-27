#!/usr/bin/env tsx
/**
 * Probe: how does Intervals.icu treat various update_event payloads against a
 * structured WORKOUT event? Verifies the assumptions in the plan for fixing
 * GitHub issue #1.
 *
 * Cleans up after itself.
 */
import "dotenv/config";
import { createServices } from "../src/index.js";
import { buildEvent } from "../src/services/workout-scheduling/builder.js";

function header(s: string) {
  console.log("\n" + "=".repeat(70) + "\n" + s + "\n" + "=".repeat(70));
}

function stepSummary(ev: Record<string, unknown> | undefined): string {
  if (!ev) return "(no event)";
  const doc = ev.workout_doc as { steps?: unknown[] } | undefined;
  const steps = doc?.steps ?? [];
  return `workout_doc.steps.length=${steps.length}; description (first 140):\n  ${String(
    ev.description ?? ""
  )
    .replace(/\n/g, " | ")
    .slice(0, 140)}`;
}

async function main() {
  const services = createServices();
  const httpClient = (
    services as unknown as {
      httpClient: { request: <T>(p: string, o?: unknown) => Promise<T> };
    }
  ).httpClient;
  const athleteId = process.env.INTERVALS_ATHLETE_ID ?? "0";

  const date = "2030-01-15";
  const externalId = `probe-update-event-${Date.now()}`;
  const orphans: number[] = [];

  let createdId: number | undefined;

  try {
    header("0. create a multi-step structured workout (with external_id)");
    const event = buildEvent({
      name: "PROBE update_event multistep",
      date,
      sportType: "Ride",
      steps: [
        { label: "Warmup", duration: "10m", target: "150w" },
        {
          iterations: 3,
          label: "Main Set",
          steps: [
            { label: "On", duration: "5m", target: "240w" },
            { label: "Off", duration: "3m", target: "150w" },
          ],
        },
        { label: "Cooldown", duration: "5m", target: "140w" },
      ],
      externalId,
    });
    const created = (await services.events.createEvents([event])) as Array<
      Record<string, unknown>
    >;
    createdId = created[0]?.id as number;
    if (!createdId) throw new Error("no id from create");
    console.log("created event id:", createdId);

    let cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after create:", stepSummary(cur));

    header(
      "E. PUT /events/{id} with FULL workout-text description — does PUT also rebuild steps?"
    );
    const fullWorkoutText = [
      "- Warmup 10m 150w",
      "",
      "2x",
      "- On 4m 230w",
      "- Off 2m 140w",
      "",
      "- Cooldown 5m 140w",
    ].join("\n");
    await httpClient.request<unknown>(
      `/api/v1/athlete/${athleteId}/events/${createdId}`,
      { method: "PUT", body: { description: fullWorkoutText } }
    );
    cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after PUT full workout-text:", stepSummary(cur));

    header(
      "F. can we set external_id via PUT on an event that doesn't have one?"
    );
    // first create a no-external-id event
    const noExt = (await services.events.createEvents([
      {
        category: "WORKOUT" as const,
        start_date_local: `${date}T00:00:00`,
        type: "Ride" as const,
        name: "PROBE no-external-id event",
        description: "- Warmup 5m 150w",
      },
    ])) as Array<Record<string, unknown>>;
    const noExtId = noExt[0].id as number;
    orphans.push(noExtId);
    console.log(
      "no-ext event id:",
      noExtId,
      "external_id from server:",
      noExt[0].external_id
    );
    const newExtId = `probe-set-via-put-${Date.now()}`;
    try {
      await httpClient.request<unknown>(
        `/api/v1/athlete/${athleteId}/events/${noExtId}`,
        { method: "PUT", body: { external_id: newExtId } }
      );
      const after = (await services.events.getEvent(
        noExtId
      )) as unknown as Record<string, unknown>;
      console.log("after PUT external_id:", { external_id: after.external_id });
    } catch (e) {
      console.log("PUT external_id ERROR:", (e as Error).message);
    }
  } finally {
    if (createdId !== undefined) orphans.push(createdId);
    header("cleanup");
    for (const id of orphans) {
      try {
        await services.events.deleteEvents([{ id }]);
        console.log("deleted", id);
      } catch (e) {
        console.log("delete ERROR for", id, ":", (e as Error).message);
      }
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
