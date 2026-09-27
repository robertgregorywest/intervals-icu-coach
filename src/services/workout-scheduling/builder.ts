import type { IntervalsEvent, SportType } from "../../types.js";
import type { WorkoutPlan, WorkoutStep, RepeatBlock } from "./plan.js";
import { isRepeatBlock } from "./plan.js";

function formatStep(step: WorkoutStep): string {
  const parts: string[] = [];

  if (step.label) {
    parts.push(step.label);
  }

  parts.push(step.duration);

  if (step.ramp && step.target) {
    parts.push(`ramp ${step.target}`);
  } else if (step.target) {
    parts.push(step.target);
  }

  if (step.cadence) {
    parts.push(step.cadence);
  }

  return `- ${parts.join(" ")}`;
}

function formatRepeatBlock(block: RepeatBlock): string {
  const header = block.label
    ? `${block.label} ${block.iterations}x`
    : `${block.iterations}x`;

  const steps = block.steps.map(formatStep).join("\n");

  return `${header}\n${steps}`;
}

/** Workout-text for a set of steps, with any session prose above them. */
export function toDescription(
  steps: Array<WorkoutStep | RepeatBlock>,
  notes?: string
): string {
  const sections: string[] = [];
  const prose = notes?.trim();
  if (prose) sections.push(prose);

  for (const step of steps) {
    if (isRepeatBlock(step)) {
      sections.push(formatRepeatBlock(step));
    } else {
      sections.push(formatStep(step));
    }
  }

  return sections.join("\n\n");
}

export function buildEvent(plan: WorkoutPlan): IntervalsEvent {
  return workoutEvent({
    name: plan.name,
    date: plan.date,
    type: plan.sportType,
    description: toDescription(plan.steps, plan.notes),
    externalId: plan.externalId,
    color: plan.color,
  });
}

/** How every calendar write addresses a day: local midnight. */
export function startOfDay(date: string): string {
  return `${date}T00:00:00`;
}

export interface CalendarWorkout {
  name: string;
  date: string;
  type: SportType;
  description: string;
  externalId?: string;
  color?: string;
}

/**
 * The one shape of WORKOUT event this server writes. Without an external id
 * it gets `mcp-<date>-<slug>`, so writing the same workout twice upserts it.
 */
export function workoutEvent(w: CalendarWorkout): IntervalsEvent {
  return {
    category: "WORKOUT",
    start_date_local: startOfDay(w.date),
    type: w.type,
    name: w.name,
    description: w.description,
    external_id: w.externalId || `mcp-${w.date}-${slugify(w.name)}`,
    ...(w.color ? { color: w.color } : {}),
  };
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
