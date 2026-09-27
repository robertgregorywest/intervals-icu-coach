#!/usr/bin/env tsx
/**
 * Deletes folders + workouts left over from the previous seed run that used a
 * nested "Coach Templates / <category>" layout. Identifies seeded items by:
 *   - the literal name "Coach Templates" (the empty parent folder), OR
 *   - any folder containing a workout whose rationale block has a known seedId.
 *
 * Default = dry run. Pass --apply to actually delete.
 */
import "dotenv/config";
import { createServices } from "../src/index.js";
import {
  CANONICAL_TEMPLATES,
  extractRationale,
} from "../src/services/workout-library/index.js";

const apply = process.argv.includes("--apply");

interface RawFolder {
  id: number;
  name: string;
  type: string;
  children?: Array<{
    id: number;
    name: string;
    type: string;
    description?: string;
  }>;
}

async function main() {
  const services = createServices();
  const httpClient = (
    services as unknown as {
      httpClient: { request: <T>(p: string, o?: unknown) => Promise<T> };
    }
  ).httpClient;
  const athleteId = process.env.INTERVALS_ATHLETE_ID ?? "0";

  const folders = await httpClient.request<RawFolder[]>(
    `/api/v1/athlete/${athleteId}/folders`
  );

  const seedIds = new Set(CANONICAL_TEMPLATES.map((t) => t.seedId));
  const seededFolderNames = new Set([
    "Tests",
    "VO2 Max",
    "Threshold",
    "Sweet Spot",
    "Endurance",
    "Recovery",
  ]);
  const userPreexistingFolderIds = new Set([745561, 745555]); // never touch

  const foldersToDelete: number[] = [];
  const workoutsToDelete: Array<{ id: number; name: string }> = [];

  for (const folder of folders) {
    if (folder.type !== "FOLDER") continue;
    if (userPreexistingFolderIds.has(folder.id)) continue;

    const seededChildren = (folder.children ?? []).filter((c) => {
      if (c.type === "FOLDER") return false;
      const r = extractRationale(c.description ?? "");
      return r?.seedId && seedIds.has(r.seedId);
    });

    const isCoachTemplatesParent = folder.name === "Coach Templates";
    const isSeededLeaf =
      seededFolderNames.has(folder.name) && seededChildren.length > 0;
    const isEmptyLeftoverTests =
      folder.name === "Tests" && (folder.children?.length ?? 0) === 0;

    if (isCoachTemplatesParent || isSeededLeaf || isEmptyLeftoverTests) {
      console.log(
        `[folder] ${folder.id} "${folder.name}" — ${folder.children?.length ?? 0} children, ${seededChildren.length} seeded`
      );
      for (const c of seededChildren) {
        console.log(`    [workout] ${c.id} "${c.name}"`);
        workoutsToDelete.push({ id: c.id, name: c.name });
      }
      foldersToDelete.push(folder.id);
    }
  }

  console.log(
    `\nPlanned: delete ${workoutsToDelete.length} workouts + ${foldersToDelete.length} folders`
  );

  if (!apply) {
    console.log("\n(dry run — pass --apply to execute)");
    return;
  }

  for (const w of workoutsToDelete) {
    await httpClient.request<void>(
      `/api/v1/athlete/${athleteId}/workouts/${w.id}`,
      { method: "DELETE" }
    );
    console.log(`deleted workout ${w.id} "${w.name}"`);
  }
  for (const id of foldersToDelete) {
    await httpClient.request<void>(
      `/api/v1/athlete/${athleteId}/folders/${id}`,
      { method: "DELETE" }
    );
    console.log(`deleted folder ${id}`);
  }
  console.log(
    `\n✓ cleanup complete: ${workoutsToDelete.length} workouts + ${foldersToDelete.length} folders`
  );
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
