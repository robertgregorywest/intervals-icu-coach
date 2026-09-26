import { z } from "zod";
import { defineTool, MUTATING, READ_ONLY, UPSERT } from "./define.js";

const listWorkoutLibrarySchema = z.object({
  folder: z
    .string()
    .optional()
    .describe(
      "Optional folder name to filter (exact match). " +
        "Omit to list all folders."
    ),
});

const listWorkoutLibraryOutputSchema = z.object({
  folders: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      num_workouts: z.number(),
    })
  ),
  workouts: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      type: z.string().optional(),
      folder_id: z.number().nullable().optional(),
      folder_name: z.string().optional(),
      stepCount: z.number(),
      totalSeconds: z.number(),
      hasTemplate: z.boolean(),
      purpose: z.string().optional(),
      oneLine: z.string(),
    })
  ),
});

export const listWorkoutLibraryTool = defineTool({
  name: "list_workout_library",
  description:
    "List the athlete's saved workouts (folders + workouts with name and a one-line summary). " +
    "Use this BEFORE composing an ad-hoc session so you reuse the athlete's curated templates. " +
    'Optional "folder" arg filters by folder name. ' +
    "Each workout carries a `purpose` saying what it is FOR — use that to pick the right one. " +
    "`hasTemplate` marks workouts maintained by sync_workout_library. " +
    "Returns: { folders: [...], workouts: [{ id, name, folder_id, stepCount, totalSeconds, hasTemplate, purpose, oneLine }] }.",
  schema: listWorkoutLibrarySchema,
  annotations: READ_ONLY,
  outputSchema: listWorkoutLibraryOutputSchema,
  handler: (client, args) => client.workoutLibrary.list(args.folder),
});

const getWorkoutLibraryItemSchema = z.object({
  id: z.number().describe("Library workout ID (from list_workout_library)"),
});

export const getWorkoutLibraryItemTool = defineTool({
  name: "get_workout_library_item",
  description:
    "Get the full body of a saved workout: prose rationale, steps and provenance. " +
    "Returns: { workout, description_text, seedId, summary } where seedId names the template " +
    "the workout is rendered from (null when nothing manages it).",
  schema: getWorkoutLibraryItemSchema,
  annotations: READ_ONLY,
  outputSchema: null,
  handler: (client, args) => client.workoutLibrary.get(args.id),
});

const syncWorkoutLibrarySchema = z.object({
  mapWatts: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Athlete's current MAP (Maximal Aerobic Power) in watts. Templates whose " +
        "basis is MAP are rendered against this value; omit and they are skipped."
    ),
  ftpWatts: z
    .number()
    .int()
    .positive()
    .optional()
    .describe(
      "Athlete's current FTP in watts. Templates whose basis is FTP are rendered " +
        "against this value; omit and they are skipped."
    ),
  dryRun: z
    .boolean()
    .optional()
    .describe(
      "If true, report what would be created and updated without writing anything."
    ),
});

const syncActionSchema = z.object({
  seedId: z.string(),
  name: z.string(),
  folder: z.string(),
  workoutId: z.number().optional(),
  changed: z.array(z.string()).optional(),
  adopted: z.boolean().optional(),
});

const syncWorkoutLibraryOutputSchema = z.object({
  dryRun: z.boolean(),
  created: z.array(syncActionSchema),
  updated: z.array(syncActionSchema),
  unchanged: z.array(syncActionSchema),
  skipped: z.array(
    z.object({
      seedId: z.string(),
      name: z.string(),
      reason: z.string(),
    })
  ),
  orphans: z.array(
    z.object({
      workoutId: z.number(),
      name: z.string(),
      folder: z.string(),
      seedId: z.string(),
    })
  ),
  warnings: z.array(z.string()),
});

export const syncWorkoutLibraryTool = defineTool({
  name: "sync_workout_library",
  description:
    "Reconcile the Intervals.icu library against the tracked Workout templates. " +
    "The template files are the source of truth: each is rendered at the supplied " +
    "MAP/FTP and upserted, matched by its template marker — creating what is missing, " +
    "updating what changed (steps, prose, name or folder), and re-anchoring watts when " +
    "MAP or FTP has moved. Run it after editing a template AND after a new test result. " +
    "Never deletes: a library workout whose template has gone is reported as an orphan. " +
    "Hand edits made in the Intervals.icu UI are overwritten — edit the template file instead. " +
    "Use dryRun=true to preview. " +
    "Returns: { dryRun, created, updated, unchanged, skipped, orphans, warnings }.",
  schema: syncWorkoutLibrarySchema,
  annotations: UPSERT,
  outputSchema: syncWorkoutLibraryOutputSchema,
  handler: (client, args) => client.workoutLibrary.sync(args),
});

const deleteWorkoutLibraryItemSchema = z.object({
  id: z
    .number()
    .describe("Library workout ID (from list_workout_library) to delete"),
});

const deleteWorkoutLibraryItemOutputSchema = z.object({
  success: z.literal(true),
  deleted: z.number().describe("ID of the deleted library workout"),
});

export const deleteWorkoutLibraryItemTool = defineTool({
  name: "delete_workout_library_item",
  description:
    "Delete a saved library workout by id (from list_workout_library). Cannot be undone. " +
    "Use it to clear an orphan reported by sync_workout_library, or a workout whose template " +
    "you have removed. Does not touch calendar events (use delete_events). " +
    "A workout that still has a template file is recreated by the next sync_workout_library. " +
    "To change a template-backed workout, edit its template file and sync — do not delete and recreate. " +
    "Returns: { success: true, deleted: id }.",
  schema: deleteWorkoutLibraryItemSchema,
  annotations: MUTATING,
  outputSchema: deleteWorkoutLibraryItemOutputSchema,
  async handler(client, args) {
    await client.workoutLibrary.delete(args.id);
    return { success: true as const, deleted: args.id };
  },
});
