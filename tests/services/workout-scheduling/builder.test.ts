import { describe, it, expect } from "vitest";
import {
  buildEvent,
  toDescription,
} from "../../../src/services/workout-scheduling/builder.js";
import type {
  WorkoutStep,
  RepeatBlock,
  WorkoutPlan,
} from "../../../src/services/workout-scheduling/plan.js";

describe("workout builder", () => {
  describe("toDescription", () => {
    it("formats a simple step with duration and target", () => {
      const steps: WorkoutStep[] = [{ duration: "10m", target: "60%" }];
      expect(toDescription(steps)).toBe("- 10m 60%");
    });

    it("formats a step with label", () => {
      const steps: WorkoutStep[] = [
        { label: "Warmup", duration: "10m", target: "60%" },
      ];
      expect(toDescription(steps)).toBe("- Warmup 10m 60%");
    });

    it("formats a step with cadence", () => {
      const steps: WorkoutStep[] = [
        { duration: "5m", target: "95%", cadence: "90rpm" },
      ];
      expect(toDescription(steps)).toBe("- 5m 95% 90rpm");
    });

    it("formats a ramp step", () => {
      const steps: WorkoutStep[] = [
        { duration: "10m", target: "50%-75%", ramp: true },
      ];
      expect(toDescription(steps)).toBe("- 10m ramp 50%-75%");
    });

    it("formats a ramp step with label and cadence", () => {
      const steps: WorkoutStep[] = [
        {
          label: "Warmup",
          duration: "15m",
          target: "40%-70%",
          cadence: "85rpm",
          ramp: true,
        },
      ];
      expect(toDescription(steps)).toBe("- Warmup 15m ramp 40%-70% 85rpm");
    });

    it("formats a step with duration only (freeride)", () => {
      const steps: WorkoutStep[] = [{ duration: "20m" }];
      expect(toDescription(steps)).toBe("- 20m");
    });

    it("formats a step with distance", () => {
      const steps: WorkoutStep[] = [
        { duration: "2km", target: "5:00/km Pace" },
      ];
      expect(toDescription(steps)).toBe("- 2km 5:00/km Pace");
    });

    it("formats a repeat block", () => {
      const steps: RepeatBlock[] = [
        {
          iterations: 4,
          steps: [
            { duration: "2m", target: "95%" },
            { duration: "2m", target: "55%" },
          ],
        },
      ];
      expect(toDescription(steps)).toBe("4x\n- 2m 95%\n- 2m 55%");
    });

    it("formats a repeat block with label", () => {
      const steps: RepeatBlock[] = [
        {
          iterations: 4,
          label: "Main Set",
          steps: [
            { duration: "2m", target: "95%" },
            { duration: "2m", target: "55%" },
          ],
        },
      ];
      expect(toDescription(steps)).toBe("Main Set 4x\n- 2m 95%\n- 2m 55%");
    });

    it("formats a full workout with mixed steps and repeats", () => {
      const steps: Array<WorkoutStep | RepeatBlock> = [
        { label: "Warmup", duration: "10m", target: "60%" },
        {
          iterations: 4,
          label: "Main Set",
          steps: [
            { duration: "2m", target: "95%" },
            { duration: "2m", target: "55%" },
          ],
        },
        { label: "Recovery", duration: "5m", target: "50%" },
      ];
      expect(toDescription(steps)).toBe(
        "- Warmup 10m 60%\n\n" +
          "Main Set 4x\n- 2m 95%\n- 2m 55%\n\n" +
          "- Recovery 5m 50%"
      );
    });

    it("formats HR target steps", () => {
      const steps: WorkoutStep[] = [{ duration: "30m", target: "70% HR" }];
      expect(toDescription(steps)).toBe("- 30m 70% HR");
    });

    it("formats power zone steps", () => {
      const steps: WorkoutStep[] = [{ duration: "20m", target: "Z2" }];
      expect(toDescription(steps)).toBe("- 20m Z2");
    });

    it("formats watt-based steps", () => {
      const steps: WorkoutStep[] = [{ duration: "5m", target: "220w" }];
      expect(toDescription(steps)).toBe("- 5m 220w");
    });
  });

  describe("buildEvent", () => {
    it("builds a complete event from a workout plan", () => {
      const plan: WorkoutPlan = {
        name: "Sweet Spot Intervals",
        date: "2024-03-30",
        sportType: "Ride",
        steps: [
          { label: "Warmup", duration: "10m", target: "60%" },
          {
            iterations: 3,
            steps: [
              { duration: "8m", target: "88-93%" },
              { duration: "4m", target: "55%" },
            ],
          },
          { label: "Cooldown", duration: "10m", target: "50%" },
        ],
      };

      const event = buildEvent(plan);

      expect(event.category).toBe("WORKOUT");
      expect(event.type).toBe("Ride");
      expect(event.name).toBe("Sweet Spot Intervals");
      expect(event.start_date_local).toBe("2024-03-30T00:00:00");
      expect(event.external_id).toBe("mcp-2024-03-30-sweet-spot-intervals");
      expect(event.description).toContain("- Warmup 10m 60%");
      expect(event.description).toContain("3x\n- 8m 88-93%\n- 4m 55%");
      expect(event.description).toContain("- Cooldown 10m 50%");
    });

    it("uses provided externalId", () => {
      const plan: WorkoutPlan = {
        name: "Test",
        date: "2024-01-01",
        sportType: "Run",
        steps: [{ duration: "30m", target: "Z2" }],
        externalId: "my-custom-id",
      };

      const event = buildEvent(plan);
      expect(event.external_id).toBe("my-custom-id");
    });

    it("includes color when provided", () => {
      const plan: WorkoutPlan = {
        name: "Test",
        date: "2024-01-01",
        sportType: "Ride",
        steps: [{ duration: "30m", target: "60%" }],
        color: "green",
      };

      const event = buildEvent(plan);
      expect(event.color).toBe("green");
    });

    it("omits color when not provided", () => {
      const plan: WorkoutPlan = {
        name: "Test",
        date: "2024-01-01",
        sportType: "Ride",
        steps: [{ duration: "30m", target: "60%" }],
      };

      const event = buildEvent(plan);
      expect(event.color).toBeUndefined();
    });
  });
});
