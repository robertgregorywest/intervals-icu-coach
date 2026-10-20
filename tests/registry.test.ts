import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { TOOLS } from "../src/registry.js";

describe("TOOLS registry", () => {
  // Claude Desktop shows the manifest's list, not the server's, so a Tool
  // missing from it is undiscoverable there.
  it("manifest.json declares exactly the registered tools", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../manifest.json", import.meta.url), "utf8")
    ) as { tools: Array<{ name: string }> };
    expect(manifest.tools.map((t) => t.name).sort()).toEqual(
      TOOLS.map((t) => t.name).sort()
    );
  });

  it("tool names are unique", () => {
    const names = TOOLS.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  it("includes expected tools", () => {
    const names = new Set(TOOLS.map((t) => t.name));
    expect(names.has("get_athlete")).toBe(true);
    expect(names.has("create_workout")).toBe(true);
    expect(names.has("delete_events")).toBe(true);
    expect(names.has("get_coaching_context")).toBe(true);
    expect(names.has("sync_workout_library")).toBe(true);
    expect(names.has("compute_power_profile")).toBe(true);
  });

  it("delete_events and update_event use MUTATING annotations", () => {
    const deleteEvents = TOOLS.find((t) => t.name === "delete_events");
    const updateEvent = TOOLS.find((t) => t.name === "update_event");
    expect(deleteEvents?.annotations.destructiveHint).toBe(true);
    expect(updateEvent?.annotations.destructiveHint).toBe(true);
  });

  it("get_* tools use READ_ONLY annotations", () => {
    const readOnlyTools = TOOLS.filter((t) => t.name.startsWith("get_"));
    for (const t of readOnlyTools) {
      expect(t.annotations.readOnlyHint, `${t.name} is read-only`).toBe(true);
    }
  });
});
