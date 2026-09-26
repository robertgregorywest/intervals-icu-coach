import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";
import { TOOLS } from "../../src/registry.js";
import type { IIntervalsClient } from "../../src/index.js";

async function connectedClient(
  intervalsClient: IIntervalsClient
): Promise<Client> {
  const server = createMcpServer(intervalsClient);
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
  let client: Client;

  beforeAll(async () => {
    client = await connectedClient({} as IIntervalsClient);
  });

  afterAll(async () => {
    await client.close();
  });

  it("registers exactly the registry's tools — nothing missing, nothing extra", async () => {
    const { tools } = await client.listTools();
    const registered = new Set(tools.map((t) => t.name));
    const expected = new Set(TOOLS.map((t) => t.name));
    expect(registered).toEqual(expected);
  });

  it("carries each ToolDef's description, schema, outputSchema, and annotations", async () => {
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));

    for (const def of TOOLS) {
      const registered = byName.get(def.name);
      expect(registered, `${def.name} is registered`).toBeDefined();
      if (!registered) continue;

      expect(registered.description, `${def.name} description`).toBe(
        def.description
      );

      expect(
        registered.annotations?.readOnlyHint,
        `${def.name} readOnlyHint`
      ).toBe(def.annotations.readOnlyHint);
      expect(
        registered.annotations?.destructiveHint,
        `${def.name} destructiveHint`
      ).toBe(def.annotations.destructiveHint);
      expect(
        registered.annotations?.idempotentHint,
        `${def.name} idempotentHint`
      ).toBe(def.annotations.idempotentHint);
      expect(
        registered.annotations?.openWorldHint,
        `${def.name} openWorldHint`
      ).toBe(def.annotations.openWorldHint);

      const inputKeys = Object.keys(
        registered.inputSchema.properties ?? {}
      ).sort();
      expect(inputKeys, `${def.name} input schema keys`).toEqual(
        Object.keys(def.schema.shape).sort()
      );

      if (def.outputSchema) {
        expect(
          registered.outputSchema,
          `${def.name} registers an output schema`
        ).toBeDefined();
        const outputKeys = Object.keys(
          registered.outputSchema?.properties ?? {}
        ).sort();
        expect(outputKeys, `${def.name} output schema keys`).toEqual(
          Object.keys(def.outputSchema.shape).sort()
        );
      } else {
        expect(
          registered.outputSchema,
          `${def.name} registers no output schema`
        ).toBeUndefined();
      }
    }
  });

  it("routes a no-arg call through registration to the ToolDef handler", async () => {
    const getAthlete = vi
      .fn()
      .mockResolvedValue({ id: "i1", name: "Test Athlete" });
    const mockClient = {
      athlete: { getAthlete },
    } as unknown as IIntervalsClient;
    const c = await connectedClient(mockClient);

    const result = await c.callTool({ name: "get_athlete", arguments: {} });

    expect(getAthlete).toHaveBeenCalledTimes(1);
    const [content] = result.content as Array<{ type: string; text: string }>;
    expect(JSON.parse(content.text)).toEqual({
      id: "i1",
      name: "Test Athlete",
    });

    await c.close();
  });

  it("passes parsed args to the handler and returns structuredContent for schemas that declare one", async () => {
    const getActivities = vi.fn().mockResolvedValue([]);
    const mockClient = {
      activities: { getActivities },
    } as unknown as IIntervalsClient;
    const c = await connectedClient(mockClient);

    const result = await c.callTool({
      name: "get_activities",
      arguments: { oldest: "2026-01-01", newest: "2026-01-31" },
    });

    expect(getActivities).toHaveBeenCalledWith("2026-01-01", "2026-01-31");
    expect(result.structuredContent).toMatchObject({
      total: 0,
      count: 0,
      truncated: false,
      activities: [],
    });

    await c.close();
  });
});
