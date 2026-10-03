import { vi } from "vitest";
import { z } from "zod";
import type { IServices } from "../../src/index.js";
import { defineTool, MUTATING, READ_ONLY } from "../../src/tools/define.js";

/**
 * An opaque Services token. The adapters never look inside Services — they
 * hand it to the handler — so their tests check it arrives, not what it holds.
 */
export const STUB_SERVICES = {} as IServices;

/**
 * A two-Tool registry for adapter tests: one read-only Tool with an output
 * schema, one mutating Tool without. Adapter behaviour (parsing, the `--yes`
 * guard, serialisation, registration) depends only on those shapes, so adding
 * or moving a real Tool changes none of these tests.
 */
export function stubTools() {
  const readHandler = vi.fn(
    async (_services: IServices, args: { date?: string }) => ({
      date: args.date ?? null,
    })
  );
  const writeHandler = vi.fn(
    async (_services: IServices, args: { id: number }) => ({ deleted: args.id })
  );

  const readTool = defineTool({
    name: "read_thing",
    description: "Reads a thing.",
    schema: z.object({
      date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional(),
    }),
    annotations: READ_ONLY,
    outputSchema: z.object({ date: z.string().nullable() }),
    handler: (services, args) => readHandler(services, args),
  });

  const writeTool = defineTool({
    name: "delete_thing",
    description: "Deletes a thing.",
    schema: z.object({ id: z.number() }),
    annotations: MUTATING,
    outputSchema: null,
    handler: (services, args) => writeHandler(services, args),
  });

  return { tools: [readTool, writeTool], readHandler, writeHandler };
}
