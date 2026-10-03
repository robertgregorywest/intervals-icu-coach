import { describe, it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { TOOLS, type ToolDef } from "../../src/registry.js";
import { STUB_SERVICES, stubTools } from "../helpers/stub-tools.js";

async function connectedClient(tools: readonly ToolDef[]): Promise<Client> {
  const server = createMcpServer(STUB_SERVICES, tools);
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });
  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);
  return client;
}

describe("createMcpServer", () => {
  it("carries each ToolDef's description, schema, outputSchema, and annotations", async () => {
    const { tools } = stubTools();
    const client = await connectedClient(tools);
    const { tools: listed } = await client.listTools();
    await client.close();

    expect(listed.map((t) => t.name)).toEqual(["read_thing", "delete_thing"]);
    const [read, write] = listed;

    expect(read.description).toBe("Reads a thing.");
    expect(read.annotations).toMatchObject(tools[0].annotations);
    expect(Object.keys(read.inputSchema.properties ?? {})).toEqual(["date"]);
    expect(Object.keys(read.outputSchema?.properties ?? {})).toEqual(["date"]);

    expect(write.annotations).toMatchObject(tools[1].annotations);
    expect(Object.keys(write.inputSchema.properties ?? {})).toEqual(["id"]);
    expect(write.outputSchema).toBeUndefined();
  });

  it("passes the services and parsed args to the handler and returns structuredContent", async () => {
    const { tools, readHandler } = stubTools();
    const client = await connectedClient(tools);

    const result = await client.callTool({
      name: "read_thing",
      arguments: { date: "2026-01-01" },
    });
    await client.close();

    expect(readHandler).toHaveBeenCalledWith(STUB_SERVICES, {
      date: "2026-01-01",
    });
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content.text)).toEqual({ date: "2026-01-01" });
    expect(result.structuredContent).toEqual({ date: "2026-01-01" });
  });

  it("rejects input that fails a schema refinement before the handler", async () => {
    const { tools, writeHandler } = stubTools();
    const client = await connectedClient(tools);

    const result = await client.callTool({
      name: "delete_thing",
      arguments: { id: -1 },
    });
    await client.close();

    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content.text).toContain("id must be positive");
    expect(writeHandler).not.toHaveBeenCalled();
  });

  it("returns text content only for a Tool with no output schema", async () => {
    const { tools, writeHandler } = stubTools();
    const client = await connectedClient(tools);

    const result = await client.callTool({
      name: "delete_thing",
      arguments: { id: 7 },
    });
    await client.close();

    expect(writeHandler).toHaveBeenCalledWith(STUB_SERVICES, { id: 7 });
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content.text)).toEqual({ deleted: 7 });
    expect(result.structuredContent).toBeUndefined();
  });

  it("renders a handler error as an isError result", async () => {
    const { tools, readHandler } = stubTools();
    readHandler.mockRejectedValueOnce(new Error("API down"));
    const client = await connectedClient(tools);

    const result = await client.callTool({ name: "read_thing", arguments: {} });
    await client.close();

    expect(result.isError).toBe(true);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(content.text).toContain("API down");
  });

  // Every real Tool's schema must be accepted by the MCP SDK, or the server
  // fails to list the whole catalogue.
  it("registers every registered Tool", async () => {
    const client = await connectedClient(TOOLS);
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((t) => t.name)).toEqual(TOOLS.map((t) => t.name));
  });
});
