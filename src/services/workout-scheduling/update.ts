import type { IEventsApi } from "../events/index.js";
import type { IPrescription } from "../prescription/index.js";
import type { IntervalsEvent } from "../../types.js";
import { startOfDay, toDescription } from "./builder.js";
import type { EventChanges } from "./types.js";

/** Refuses any change that would silently destroy a workout's structure. */
export async function updateEvent(
  eventsApi: IEventsApi,
  prescription: IPrescription,
  id: number,
  changes: EventChanges
): Promise<IntervalsEvent> {
  const { date, steps, notes, description, name, category, type, color } =
    changes;

  if (steps && description !== undefined) {
    throw new Error(
      "update_event: 'steps' and 'description' are mutually exclusive. " +
        "Use 'steps' to update workout structure (description is rebuilt from it), " +
        "or 'description' alone for prose-only updates on non-WORKOUT events."
    );
  }

  if (notes !== undefined && !steps) {
    throw new Error(
      "update_event: 'notes' requires 'steps' — the description is rebuilt " +
        "from steps with notes above them."
    );
  }

  // Guard against the issue-#1 bug: PUT /events/{id} with a `description` body
  // makes Intervals.icu reparse the text as workout-text. On a structured
  // WORKOUT event, anything that isn't a valid step line collapses
  // workout_doc.steps. Force callers to use `steps` for WORKOUT updates.
  if (description !== undefined && !steps) {
    const existing = await eventsApi.getEvent(id);
    const hasSteps = (existing.workout_doc?.steps?.length ?? 0) > 0;
    if (
      existing.category === "WORKOUT" &&
      hasSteps &&
      prescription.shape(description).stepCount === 0
    ) {
      throw new Error(
        "update_event: refusing to update 'description' on a WORKOUT event — " +
          "it contains no step lines, so Intervals.icu would reparse it and " +
          "collapse workout_doc.steps. Include the step lines in the " +
          "description, or pass 'steps' (and 'notes') to rebuild it, or " +
          "update the metadata fields only (name, date, color, category, type)."
      );
    }
  }

  const data: Partial<IntervalsEvent> = {};
  if (name !== undefined) data.name = name;
  if (category !== undefined) data.category = category;
  if (type !== undefined) data.type = type;
  if (color !== undefined) data.color = color;
  if (date) data.start_date_local = startOfDay(date);
  if (description !== undefined) data.description = description;
  if (steps) data.description = toDescription(steps, notes);

  return eventsApi.updateEvent(id, data);
}
