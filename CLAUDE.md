# intervals-icu-mcp

MCP server and CLI tool for the Intervals.icu API plus tools and skills to support agentic coaching.

## Architecture

- **Services** (`src/services/`) — business logic behind interfaces (`IWorkoutScheduling`, `IEventsApi`, `IWorkoutLibrary`). Each service has `types.ts`, implementation, and `index.ts` re-exporting the interface + factory. Larger services (`workout-library/`) split into multiple files (api/parser/template/render/loader/sync/library) — same pattern, more surface.
- **Client** (`src/client.ts`) — `HttpClient` with Basic auth, rate limiting, injectable `fetchFn` for testing.
- **Composition root** (`src/index.ts`) — `IntervalsClient` builds every service once and exposes them as `IIntervalsClient`. Handlers reach services through it; it forwards nothing.
- **Tool registry** (`src/registry.ts`) — the list of all Tools (`ToolDef[]`), one line each. Both adapters iterate it — see `docs/adr/0001-cli-adapter-and-tool-registry.md`.
- **Tools** (`src/tools/`) — each Tool is one `defineTool({ name, description, schema, annotations, outputSchema, handler })`, so the handler's args are typed by its own schema. Logic beyond shaping a response belongs in a service.
- **MCP adapter** (`src/mcp/`) — `server.ts` registers each Tool; `syntax-doc.ts` is the source of truth for the workout-text `instructions`.
- **CLI adapter** (`src/cli/main.ts`, entrypoint `bin/icu`) — projects Tools as Bash subcommands via `tsx`, so it always runs the latest `src/` with no rebuild or MCP reconnect. Use it while iterating on a tool's own source, since the MCP process won't see `src/` edits until reconnected. `./bin/icu describe` prints the full catalogue; mutating commands need `--yes`. Allowlist `get_*`/`list_*`/`compute_*`/`compare_*`/`describe` as read-only; run `create_*`/`sync_*` freely (idempotent); prompt before allowlisting mutating commands. See `docs/adr/0002-cli-json-input.md`.
- **Tests** (`tests/`) — mirror `src/` structure. Use injectable fetch (not global mocks).
- **Skill evals** (`evals/skills/`) — `npm run eval:skills` scores the coaching skills against recorded scenarios in the private `docs/personal/evals/`. **Manual only, and every run costs money** — never add it to `npm test`, the hook or the release, and don't run it unasked. See `docs/evals.md` and `docs/adr/0009-skill-evals.md`.

New tools: `defineTool` in `src/tools/` → one line in `src/registry.ts` → both adapters pick it up. New behaviour gets a service with an interface, built in the `IntervalsClient` constructor.

Domain vocabulary is defined once in `CONTEXT.md` — read it before naming something new.

## Ways of working

- **Probe live before typing.** Before designing or implementing changes that touch Intervals.icu request bodies, response parsing, or query params, call a real endpoint and inspect the JSON — don't invent shapes from memory. The `intervals-api-research` skill holds the workflow and endpoint index.
- **Commit straight to `main`.** Single-maintainer repo — no feature branches, no PRs; a husky pre-commit hook runs prettier, `tsc --noEmit`, and the full suite on every commit, so a commit that lands is already green.

## Config

| Env var                | Required | Default |
| ---------------------- | -------- | ------- |
| `INTERVALS_API_KEY`    | Yes      | —       |
| `INTERVALS_ATHLETE_ID` | No       | `0`     |

## Agent skills

### Issue tracker

Issues live in GitHub Issues for `robertgregorywest/intervals-icu-mcp` (use the `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Canonical label vocabulary, no overrides. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
