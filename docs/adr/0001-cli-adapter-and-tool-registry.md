# Expose Tools through adapters over a shared registry

Intervals.icu operations were registered by hand inside the MCP server (`src/mcp/server.ts`), and iterating on them meant rebuilding and reconnecting the MCP daemon each time. To let Claude Code drive the same operations via Bash — run through `tsx` so every call uses the latest source, with no daemon — we extracted the handler layer out of `src/mcp/tools/` to `src/tools/`, made `src/registry.ts` the single source of truth, and added a **CLI adapter** alongside the **MCP adapter**. Both adapters iterate the registry, so a new Tool surfaces on both without per-adapter wiring; the MCP adapter stays the production/distribution artifact and the CLI is the agent's dev-loop surface.

## Consequences

The CLI must rebuild the discovery that MCP gives for free (tool list + input schemas) via an `icu describe` command. Accepted as the cost of a daemon-free, always-fresh agent surface. (It also carried the workout-syntax/watts instructions until ADR 0013 moved them into tool schemas and skills.)
