import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import type { IServices } from "../../src/index.js";
import {
  defineTool,
  runTool,
  MUTATING,
  READ_ONLY,
  ToolOutputError,
} from "../../src/tools/define.js";

const services = {} as IServices;

function toolReturning(result: unknown, annotations = READ_ONLY) {
  return defineTool({
    name: "thing",
    description: "A thing.",
    schema: z.object({}),
    annotations,
    outputSchema: z.object({ watts: z.number() }),
    handler: vi.fn(async () => result) as never,
  });
}

describe("runTool", () => {
  it("returns the result as given, fields the schema doesn't list included", async () => {
    const result = { watts: 220, extra: true };
    expect(await runTool(toolReturning(result), services, {})).toBe(result);
  });

  it("refuses a result its output schema rejects", async () => {
    const run = runTool(toolReturning({ watts: "220" }), services, {});
    await expect(run).rejects.toThrow(ToolOutputError);
    await expect(run).rejects.toThrow(/thing returned a result .* watts/s);
  });

  it("checks the result as JSON delivers it", async () => {
    const tool = defineTool({
      name: "thing",
      description: "A thing.",
      schema: z.object({}),
      annotations: READ_ONLY,
      outputSchema: z.object({ laps: z.array(z.number().optional()) }),
      handler: vi.fn(async () => ({ laps: [undefined, 1] })) as never,
    });
    // In-process the array passes; on the wire its hole is `null`.
    await expect(runTool(tool, services, {})).rejects.toThrow(ToolOutputError);
  });

  it("refuses a non-object result for a Tool with an output schema", async () => {
    await expect(
      runTool(toolReturning([{ watts: 220 }]), services, {})
    ).rejects.toThrow(ToolOutputError);
  });

  it("says a write already happened only for a Tool that writes", async () => {
    await expect(
      runTool(toolReturning({}, MUTATING), services, {})
    ).rejects.toThrow(/already happened/);
    await expect(runTool(toolReturning({}), services, {})).rejects.not.toThrow(
      /already happened/
    );
  });

  it("passes any result through for a Tool with no output schema", async () => {
    const tool = { ...toolReturning("anything"), outputSchema: null };
    expect(await runTool(tool, services, {})).toBe("anything");
  });
});
