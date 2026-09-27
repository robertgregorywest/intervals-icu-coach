# Knowledge lives in a Tool's schema or in a skill, never in adapter instructions

`src/mcp/syntax-doc.ts` assembled ~6.5 KB of `instructions` — workout-text grammar, the step-label
work-word vocabulary, the watts-at-the-API rule, head-unit ramp splitting, "check the library
first" and a tool inventory — and both adapters served it: the MCP server on every connection, the
CLI in every `icu describe`. The CLI importing a file from `src/mcp/` was the visible symptom; the
cause was that three kinds of knowledge had been put in one place that fitted none of them. We
deleted the file and placed each piece where it is consumed.

- **A Tool's input contract goes in its schema.** How `create_workout` / `update_event` read a step
  — the label's first word declaring a work step, no `number+unit` or zone token in a label,
  target bands versus `ramp` — lives in the `.describe()` of the field it governs. Both adapters
  serve it through the registry, and a caller pays for it only when it looks at that Tool. The
  work-word list in the label description is generated from `WORK_WORDS`, so it cannot drift.
- **Enforce it in code where possible.** The label-token rule was prose that a model could skip;
  the workout builder now refuses such a label, so the rule is learned from the error on the one
  call that breaks it rather than paid for on every connection.
- **Coaching and writing practice goes in a skill.** The raw grammar, examples, cadence rules and
  head-unit granularity live in `compose-workout/syntax-cheatsheet.md` and `power-conversion.md`,
  which are now canonical rather than mirrors. The tool inventory repeated the tool descriptions
  and was dropped.

## Consequences

`icu describe` returns tools only. The MCP server keeps a few lines of `instructions`, written in
`src/mcp/server.ts`, as an orientation for clients that load no skills (the `.mcpb` install):
session start, library first, absolute watts. Such a client no longer sees the raw workout-text
grammar; that only matters when it hand-writes a `description`, since structured steps are covered
by the schema.
