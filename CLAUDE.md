# intervals-icu-coach

MCP server and CLI tool for the Intervals.icu API plus tools and skills to support agentic coaching.

## Changing code

Before changing anything under `src/`, `tests/`, `evals/` or `scripts/`, read `docs/architecture/README.md` — layout, adding a Tool, the dev loop — and `CODING_STANDARDS.md`, the rules a change is reviewed against. Before naming or exploring a domain concept, read the glossary in `CONTEXT.md`.

## Ways of working

- **Commit straight to `main`.** Single-maintainer repo — no feature branches, no PRs; the pre-commit hook runs the full gate, so a commit that lands is already green.
- **Skill evals cost money.** Run `npm run eval:skills` only when asked.

## Agent skills

- **Issue tracker**: GitHub Issues for `robertgregorywest/intervals-icu-coach`. See `docs/agents/issue-tracker.md`.
- **Triage labels**: canonical vocabulary, no overrides. See `docs/agents/triage-labels.md`.
- **Domain docs**: single-context — one root `CONTEXT.md` glossary; decisions in `docs/adr/`. See `docs/agents/domain.md`.
