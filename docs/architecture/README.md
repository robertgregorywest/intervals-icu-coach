# Architecture

How the code is laid out and the rules that keep it that way. Read it before changing anything under
`src/`, `tests/`, `evals/` or `scripts/`. The domain language lives in the
[context map](../../CONTEXT-MAP.md) — read the glossary for the area you're touching before naming
something new.

## Layout

- **Service modules** (`src/services/`) — every module, pure or Intervals.icu-backed, exposes an `IX` interface and a `createX()` factory returning it, is built in `createServices`, and reaches consumers through `deps`. Larger modules (`workout-library/`, `track/`) split into multiple files or folders behind the same index. Rules below.
- **Shared** (`src/shared/`) — pure domain primitives needed by two or more modules or tools, one file per concept (`power.ts`, `map-zones.ts`, `middle-band.ts`, `dates.ts`, …). They are not modules, are imported directly, and import only each other. Before adding to it, check whether the helper belongs behind the owning module's interface instead.
- **Client** (`src/client.ts`) — `HttpClient` with Basic auth, rate limiting, injectable `fetchFn` for testing.
- **Services** (`src/index.ts`) — the composition root: `createServices()` builds every service once and returns them as `IServices`, which every handler receives as `services`. It forwards nothing.
- **Tool registry** (`src/registry.ts`) — the list of all Tools (`ToolDef[]`), one line each. Both adapters iterate it ([ADR 0001](../adr/0001-cli-adapter-and-tool-registry.md)).
- **Tools** (`src/tools/`) — each Tool is one `defineTool({ name, description, schema, annotations, outputSchema, handler })`, so the handler's args are typed by its own schema. Logic beyond shaping a response belongs in a service.
- **MCP adapter** (`src/mcp/`) — `server.ts` registers each Tool, with a few lines of `instructions` for clients that load no skills.
- **CLI adapter** (`src/cli/main.ts`, entrypoint `bin/icu`) — projects Tools as Bash subcommands via `tsx` ([ADR 0002](../adr/0002-cli-json-input.md)). See the dev loop below.
- **Tests** (`tests/`) — mirror `src/` structure. Use injectable fetch (not global mocks).
- **Skill evals** (`evals/skills/`) — score the coaching skills against recorded scenarios. See below.

The terms above are defined in the [Tool surface glossary](../../src/CONTEXT.md).

## Adding behaviour

- **A new Tool**: `defineTool` in `src/tools/` → one line in `src/registry.ts` → both adapters pick it up.
- **New behaviour**: a module with an interface and factory under `src/services/`, built in `createServices`.

## Module rules

From [ADR 0014](../adr/0014-modules-behind-interfaces.md) and its amendment:

- A module's `index.ts` exports only the interface, the factory, the types the interface uses and primitive constants from its input contract (such as `MAX_DAYS`) — never a class, helper or error class. `tests/module-indexes.test.ts` enforces it.
- Code outside the module imports nothing but its index. `npm run check:imports` enforces it, in the pre-commit hook.
- A module's own tests may reach its internals; other tests substitute it through `deps`.

## Knowledge placement

A Tool's input contract goes in its schema `.describe()`, enforced in code where possible; coaching and workout-writing practice goes in a skill. Neither adapter carries shared instructions ([ADR 0013](../adr/0013-knowledge-in-schemas-and-skills.md)).

## Dev loop

- **Iterate through the CLI.** `./bin/icu` always runs the latest `src/` with no rebuild or MCP reconnect; the MCP process won't see `src/` edits until reconnected. `./bin/icu describe` prints the full catalogue; mutating commands need `--yes`. Which commands to allowlist or run freely: the permission tiers in [`docs/agents/icu-cli.md`](../agents/icu-cli.md).
- **Probe live before typing.** Before designing or implementing changes that touch Intervals.icu request bodies, response parsing, or query params, call a real endpoint and inspect the JSON — don't invent shapes from memory. The `intervals-api-research` skill holds the workflow and endpoint index.
- **The pre-commit hook is the gate.** It runs prettier, the import check, `npm run typecheck` (`src/`, then `tests/` and `evals/` via `tsconfig.test.json`), and the full suite, so a commit that lands is already green.
- **Skill evals are manual, and every run costs money.** `npm run eval:skills` scores the skills against the private `docs/personal/evals/`; it stays out of `npm test`, the hook and the release. See [`docs/evals.md`](../evals.md) and [ADR 0009](../adr/0009-skill-evals.md).

## Diagrams

Sources for [Archify](https://github.com/tt-a1i/archify) diagrams. The `*.archify.json` spec is the source of truth; the rendered `*.html` is gitignored — rebuild it locally.

### Deep modules

`deep-modules.archify.json` — the service modules in `src/services/`, their one-line responsibilities, and the layers around them (Tool registry and **Services** above, the thin Intervals.icu API wrappers and `HttpClient` below).

Rebuild:

```bash
node ~/.claude/skills/archify/bin/archify.mjs deliver architecture \
  docs/architecture/deep-modules.archify.json docs/architecture/deep-modules.html --quality showcase
```

Keep in mind when editing:

- The showcase profile rejects crossing or shared edge corridors, so only a representative subset of dependencies is drawn. The rest are stated in the "Deep core" card — keep the card honest when dependencies change.
- `map` and `workout-parser` are folded into **Athlete anchors** and **Prescription**, the only modules that use them.
- Update the diagram when a service is added, merged or split, using the names from the [context map](../../CONTEXT-MAP.md).
