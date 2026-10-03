import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { TOOLS } from "../src/registry.js";

// One real result per Tool, captured by scripts/capture-tool-outputs.ts. A
// schema that drifts from what its Tool returns fails here, not for a caller.
const DIR = new URL("./fixtures/tool-outputs/", import.meta.url);
const withOutput = TOOLS.filter((t) => t.outputSchema);

describe("every Tool's output schema", () => {
  it.each(withOutput.map((t) => [t.name, t] as const))(
    "%s accepts its captured result",
    (name, tool) => {
      const file = new URL(`${name}.json`, DIR);
      expect(existsSync(file), `capture ${name}'s output`).toBe(true);
      const { output } = JSON.parse(readFileSync(file, "utf8"));
      const parsed = tool.outputSchema!.safeParse(output);
      expect(parsed.error?.message).toBeUndefined();
    }
  );

  it("has no capture for a Tool that no longer declares one", () => {
    const names = new Set(withOutput.map((t) => `${t.name}.json`));
    expect(readdirSync(DIR).filter((f) => !names.has(f))).toEqual([]);
  });
});
