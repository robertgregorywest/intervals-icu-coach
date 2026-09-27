#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServices, type IServices } from "../index.js";
import { createMcpServer } from "./server.js";

async function main() {
  let services: IServices;
  try {
    services = createServices();
  } catch (error) {
    console.error("[intervals-icu-mcp] Failed to create services:", error);
    process.exit(1);
  }

  const server = createMcpServer(services);
  const transport = new StdioServerTransport();

  process.on("SIGINT", () => {
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    process.exit(0);
  });

  await server.connect(transport);
}

main().catch((error) => {
  console.error("[intervals-icu-mcp] Fatal:", error);
  process.exit(1);
});
