# Tool surface

How Intervals.icu operations and agentic-coaching tools are defined once and surfaced through more than one transport. The vocabulary separates an operation from the surfaces that project it. Covers `src/index.ts`, `src/registry.ts`, `src/tools/`, `src/mcp/` and `src/cli/`.

One context of this repo's domain language; see the [context map](../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Tool**:
A named operation defined once as `{ name, description, input schema, handler, annotations, output schema? }`. Lives in `src/tools/`, registered in `src/registry.ts`.
_Avoid_: command, endpoint, function (for the registered unit)

**Tool registry**:
The single list (`src/registry.ts`) of all Tools, iterated by every Adapter. The source of truth for what operations exist.
_Avoid_: tool list, catalogue

**Adapter**:
A transport that projects the Tool registry onto a surface. Owns transport concerns (wire format, discovery, error rendering); never holds business logic.
_Avoid_: transport, layer (as synonyms for the module)

**MCP adapter**:
The Adapter at `src/mcp/` that projects Tools as Model Context Protocol tools. The production / distribution artifact (mcpb, manifest, desktop).

**CLI adapter**:
The Adapter at `src/cli/` that projects Tools as Bash subcommands. The agent's zero-reconnect dev surface, run via `tsx`.

**Projection**:
A single Tool as exposed by one Adapter. An **MCP tool** and a **CLI command** are two Projections of the same Tool.

**Services**:
The composition root (`src/index.ts`): `createServices(options)` builds every service once, over one `HttpClient`, and returns them as `IServices` — the one object every Tool handler receives, as `services`. It wires; it forwards nothing and holds no logic. Most of what hangs off it is domain logic computed here over Intervals.icu data (**Athlete anchors**, the **Prescription module**, the **Execution review module**, the **Training load module**), beside five thin API wrappers (events, activities, athlete, wellness, power curves).
_Avoid_: "client" or `IntervalsClient` — the only clients are `HttpClient` and the API wrappers over it; calling the whole set a client reads computed results as though Intervals.icu returned them.

## Relationships

- A **Tool** is registered once in the **Tool registry**
- Each **Adapter** iterates the **Tool registry** and produces one **Projection** per Tool
- An **MCP tool** and a **CLI command** are **Projections** of the same **Tool**
- An **Adapter** holds no business logic — that lives in the Tool's handler and the service modules it reaches through **Services**
- A new service is built once in `createServices` and reached by handlers only through **Services**; no handler or service constructs another service

## Example dialogue

> **Dev:** "If I add a `get_segments` operation, do I wire it into both the server and the CLI?"
> **Architect:** "No — you add one **Tool** to the **Tool registry**. Both **Adapters** pick it up, so you get an MCP tool and a CLI command for free. You only touch an **Adapter** if the _transport_ needs something special."

## Flagged ambiguities

- "seed" has two senses — a **Seed** is where a **Forecast** starts; a _seed case_ (tag `seed`) is one of the first **Scenarios** built for a skill. Unrelated; say "seed case" in full for the latter.
- "client" named both the HTTP layer and the composition root (`IntervalsClient`) — resolved: `HttpClient` and the API wrappers are the clients; the composition root is **Services**.
