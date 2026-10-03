import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
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
