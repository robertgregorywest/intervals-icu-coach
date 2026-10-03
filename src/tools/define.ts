import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { IServices } from "../index.js";

export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

export const MUTATING: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

/**
 * Discards data, but writing twice is the same as writing once. `MUTATING`
 * would understate the first and misstate the second.
 */
export const DESTRUCTIVE_IDEMPOTENT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: true,
  openWorldHint: true,
};

export const UPSERT: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
};

type ObjectSchema = z.ZodObject<z.ZodRawShape>;

/** What a handler resolves to: the output schema's type when it declares one. */
type ToolResult<O> = O extends ObjectSchema ? z.infer<O> : unknown;

/**
 * One Tool, whole: what both adapters project and the handler they call.
 *
 * `handler` is declared as a method so a Tool typed against its own schema is
 * still a `ToolDef` — both adapters parse `args` with the whole `schema`,
 * refinements included, before calling it.
 */
export interface Tool<
  S extends ObjectSchema = ObjectSchema,
  O extends ObjectSchema | null = ObjectSchema | null,
> {
  name: string;
  description: string;
  schema: S;
  annotations: ToolAnnotations;
  outputSchema: O;
  handler(services: IServices, args: z.infer<S>): Promise<ToolResult<O>>;
}

export type ToolDef = Tool;

export function defineTool<
  S extends ObjectSchema,
  O extends ObjectSchema | null,
>(tool: Tool<S, O>): Tool<S, O> {
  return tool;
}

/**
 * The handler's result fails the Tool's own `outputSchema` — a bug in the
 * Tool, not a failed request.
 */
export class ToolOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolOutputError";
  }
}

/**
 * Call a Tool's handler and check its result against `outputSchema`, so both
 * adapters refuse the same results. What is checked is the result as JSON
 * delivers it — both adapters send JSON, and an `undefined` in an array
 * arrives as `null`. The result is returned as the handler gave it, not as
 * parsed: parsing would strip fields the schema doesn't list.
 *
 * The check runs after the handler, so for a Tool that writes, the write has
 * already happened — the message says so, or a caller would retry it.
 */
export async function runTool(
  tool: ToolDef,
  services: IServices,
  args: unknown
): Promise<unknown> {
  const result = await tool.handler(services, args as z.infer<ObjectSchema>);
  if (!tool.outputSchema) return result;

  const sent: unknown =
    result === undefined ? undefined : JSON.parse(JSON.stringify(result));
  const parsed = tool.outputSchema.safeParse(sent);
  if (parsed.success) return result;
  throw new ToolOutputError(
    `${tool.name} returned a result its output schema rejects — a bug in the ` +
      "Tool, not a failed request." +
      (tool.annotations.readOnlyHint
        ? ""
        : " Any change this call made has already happened; check before " +
          "retrying.") +
      `\n${z.prettifyError(parsed.error)}`
  );
}
