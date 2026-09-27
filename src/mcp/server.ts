import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IServices } from "../index.js";
import { logResponse, logError } from "./logger.js";
import { formatToolError } from "../errors.js";
import { TOOLS } from "../registry.js";
import type { ToolDef } from "../registry.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

/**
 * An orientation for clients that load no skills. Each tool's own contract
 * lives in its schema and coaching practice lives in the skills, so this stays
 * a few lines — see `docs/adr/0013-knowledge-in-schemas-and-skills.md`.
 */
const INSTRUCTIONS =
  "You manage planned workouts and training analysis on Intervals.icu for the connected athlete. " +
  "Call get_coaching_context at the start of a session, and check list_workout_library before composing a workout — " +
  "the athlete's curated workouts carry intent and calibration. " +
  "Emit absolute watts (e.g. 220w, 160w-256w) in anything written to Intervals.icu: it cannot parse %MAP, " +
  "and %FTP couples the workout to whatever FTP is on file.";

export function createMcpServer(services: IServices): McpServer {
  const server = new McpServer(
    {
      name: "intervals-icu-mcp",
      version,
    },
    { instructions: INSTRUCTIONS }
  );

  function registerTool(t: ToolDef): void {
    const config: Record<string, unknown> = {
      description: t.description,
      inputSchema: t.schema.shape,
      annotations: t.annotations,
    };
    if (t.outputSchema) {
      config.outputSchema = t.outputSchema;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cb = async (args: any) => {
      const start = Date.now();
      try {
        const data = await t.handler(services, args);
        const text = JSON.stringify(data);
        logResponse(t.name, text, Date.now() - start);
        const result: Record<string, unknown> = {
          content: [{ type: "text" as const, text }],
        };
        if (t.outputSchema && isPlainObject(data)) {
          result.structuredContent = data;
        }
        return result;
      } catch (error) {
        const err = error as Error;
        logError(t.name, err, Date.now() - start);
        return {
          isError: true,
          content: [{ type: "text" as const, text: formatToolError(err) }],
        };
      }
    };

    server.registerTool(
      t.name,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cb as any
    );
  }

  for (const t of TOOLS) {
    registerTool(t);
  }

  return server;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
