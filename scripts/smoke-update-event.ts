#!/usr/bin/env tsx
/**
 * End-to-end smoke for the issue-#1 fix: drives the actual updateEvent tool
 * handler against the live Intervals.icu account. Cleans up after itself.
 */
import "dotenv/config";
import { createServices } from "../src/index.js";
import { buildEvent } from "../src/services/workout-scheduling/builder.js";
import { createWorkoutParser } from "../src/services/workout-parser/index.js";
import { updateEvent } from "../src/mcp/tools/events.js";

function header(s: string) {
  console.log("\n" + "=".repeat(70) + "\n" + s + "\n" + "=".repeat(70));
}

function summary(ev: Record<string, unknown> | undefined): string {
  if (!ev) return "(no event)";
  const doc = ev.workout_doc as { steps?: unknown[] } | undefined;
  const stepsLen = doc?.steps?.length ?? 0;
  return `name="${ev.name}", category=${ev.category}, workout_doc.steps.length=${stepsLen}`;
}

async function main() {
  const services = createServices();
  const date = "2030-01-15";
  let createdId: number | undefined;

  try {
    header("0. seed: create multi-step structured workout");
    const seed = buildEvent(
      {
        name: "SMOKE update_event multistep",
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
        externalId: `smoke-update-event-${Date.now()}`,
      },
      createWorkoutParser()
    );
    const created = (await services.events.createEvents([seed])) as Array<
      Record<string, unknown>
    >;
    createdId = created[0]?.id as number;
    if (!createdId) throw new Error("no id from create");
    let cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after seed:", summary(cur));

    header("A. update_event with name only — steps should survive");
    await updateEvent(services, { id: createdId, name: "SMOKE renamed (A)" });
    cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after A:", summary(cur));
    if (((cur.workout_doc as { steps?: unknown[] })?.steps?.length ?? 0) !== 3)
      throw new Error("A FAIL: steps changed");

    header(
      "B. update_event with steps — should rebuild description, keep structure"
    );
    await updateEvent(services, {
      id: createdId,
      steps: [
        { label: "Warmup", duration: "8m", target: "140w" },
        {
          iterations: 4,
          label: "Main",
          steps: [
            { label: "On", duration: "4m", target: "230w" },
            { label: "Off", duration: "2m", target: "140w" },
          ],
        },
        { label: "Cool", duration: "5m", target: "130w" },
      ],
    });
    cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after B:", summary(cur));
    if (((cur.workout_doc as { steps?: unknown[] })?.steps?.length ?? 0) !== 3)
      throw new Error("B FAIL: expected 3 top-level steps after restructure");

    header("C. update_event with description on WORKOUT — must reject");
    let rejected = false;
    try {
      await updateEvent(services, {
        id: createdId,
        description: "- some prose notes",
      });
    } catch (e) {
      rejected = true;
      console.log("rejected as expected:", (e as Error).message.slice(0, 120));
    }
    if (!rejected) throw new Error("C FAIL: should have rejected");
    cur = (await services.events.getEvent(createdId)) as unknown as Record<
      string,
      unknown
    >;
    console.log("after C (unchanged):", summary(cur));
    if (((cur.workout_doc as { steps?: unknown[] })?.steps?.length ?? 0) !== 3)
      throw new Error("C FAIL: structure should be untouched after rejection");

    header("D. update_event with both steps and description — must reject");
    rejected = false;
    try {
      await updateEvent(services, {
        id: createdId,
        steps: [{ duration: "10m", target: "150w" }],
        description: "x",
      });
    } catch (e) {
      rejected = true;
      console.log("rejected as expected:", (e as Error).message.slice(0, 120));
    }
    if (!rejected) throw new Error("D FAIL: should have rejected");

    console.log("\n✅ ALL SMOKE CHECKS PASSED");
  } finally {
    if (createdId !== undefined) {
      header("cleanup");
      try {
        await services.events.deleteEvents([{ id: createdId }]);
        console.log("deleted", createdId);
      } catch (e) {
        console.log("delete ERROR:", (e as Error).message);
      }
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
