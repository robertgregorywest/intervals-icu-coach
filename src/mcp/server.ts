import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { IServices } from "../index.js";
import { logResponse, logError } from "./logger.js";
import { formatToolError } from "../errors.js";
import { TOOLS } from "../registry.js";
import type { ToolDef } from "../registry.js";
import { STATIC_INSTRUCTIONS } from "./syntax-doc.js";

const require = createRequire(import.meta.url);
const { version } = require("../../package.json") as { version: string };

export function createMcpServer(services: IServices): McpServer {
  const server = new McpServer(
    {
      name: "intervals-icu-mcp",
      version,
    },
    { instructions: STATIC_INSTRUCTIONS }
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
