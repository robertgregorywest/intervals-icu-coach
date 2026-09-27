import type { SportType } from "../../types.js";

export interface WorkoutStep {
  label?: string;
  duration: string;
  target?: string;
  cadence?: string;
  ramp?: boolean;
}

export interface RepeatBlock {
  iterations: number;
  label?: string;
  steps: WorkoutStep[];
}

export interface WorkoutPlan {
  name: string;
  date: string;
  sportType: SportType;
  steps: Array<WorkoutStep | RepeatBlock>;
  notes?: string;
  externalId?: string;
  color?: string;
}

export function isRepeatBlock(
  step: WorkoutStep | RepeatBlock
): step is RepeatBlock {
  return "iterations" in step;
}
