# intervals-icu-coach

MCP server and CLI tool for the Intervals.icu API plus tools and skills to support agentic coaching.

## Changing code

Before changing anything under `src/`, `tests/`, `evals/` or `scripts/`, read `docs/architecture/README.md` — layout, module rules, adding a Tool, the dev loop. Before naming or exploring a domain concept, read `CONTEXT-MAP.md`, then the glossary for that area.

## Ways of working

- **Commit straight to `main`.** Single-maintainer repo — no feature branches, no PRs; the pre-commit hook runs the full gate, so a commit that lands is already green.
- **Skill evals cost money.** Run `npm run eval:skills` only when asked.

## Agent skills

- **Issue tracker**: GitHub Issues for `robertgregorywest/intervals-icu-coach`. See `docs/agents/issue-tracker.md`.
- **Triage labels**: canonical vocabulary, no overrides. See `docs/agents/triage-labels.md`.
- **Domain docs**: multi-context — `CONTEXT-MAP.md` points at one `CONTEXT.md` per context, beside its code; decisions in `docs/adr/`. See `docs/agents/domain.md`.
