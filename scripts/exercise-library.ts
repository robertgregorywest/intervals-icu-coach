#!/usr/bin/env tsx
/**
 * Exercises the workout library against the real Intervals.icu API to
 * verify open questions: folder payload shape, workout field names,
 * fetch path. Reads INTERVALS_API_KEY from .env.
 *
 * Usage: npx tsx scripts/exercise-library.ts
 */
import "dotenv/config";
import { createServices } from "../src/index.js";

function header(s: string) {
  console.log("\n" + "=".repeat(70) + "\n" + s + "\n" + "=".repeat(70));
}

function pretty(obj: unknown, max = 2000) {
  const json = JSON.stringify(obj, null, 2);
  return json.length > max ? json.slice(0, max) + "\n...(truncated)" : json;
}

async function main() {
  const services = createServices();

  header("1. listFolders() — raw API response shape");
  const rawFolders = await (
    services as unknown as {
      httpClient: { request: <T>(p: string) => Promise<T> };
    }
  ).httpClient.request<unknown>(
    `/api/v1/athlete/${process.env.INTERVALS_ATHLETE_ID ?? "0"}/folders`
  );
  const arr = Array.isArray(rawFolders) ? rawFolders : [];
  console.log("returned array of length:", arr.length);
  arr.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    const children = Array.isArray(e.children)
      ? (e.children as Array<Record<string, unknown>>)
      : [];
    console.log(
      `  [${i}] type=${e.type} id=${e.id} name=${JSON.stringify(e.name)} children=${children.length}`
    );
    children.forEach((c, j) => {
      console.log(
        `      child[${j}] type=${c.type} id=${c.id} name=${JSON.stringify(c.name)}`
      );
    });
  });

  header("2. workoutLibrary.list() — parsed listing");
  const listing = await services.workoutLibrary.list();
  console.log("folders:", listing.folders.length);
  console.log("workouts:", listing.workouts.length);
  if (listing.workouts.length > 0) {
    console.log("first workout summary:", pretty(listing.workouts[0]));
  }
  if (listing.folders.length > 0) {
    console.log("first folder:", listing.folders[0]);
  }

  if (listing.workouts.length > 0) {
    header("3. workoutLibrary.get() — full item");
    const id = listing.workouts[0].id;
    console.log(`fetching workout id=${id}...`);
    try {
      const item = await services.workoutLibrary.get(id);
      console.log("workout keys:", Object.keys(item.workout));
      console.log("description_text:");
      console.log(item.description_text || "(empty)");
      console.log("rationale:", item.rationale);
      console.log("summary:", item.summary);
    } catch (err) {
      console.error(
        "GET workout failed — path may be wrong:",
        (err as Error).message
      );
    }
  } else {
    console.log("\n(no workouts to fetch — skipping section 3)");
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
