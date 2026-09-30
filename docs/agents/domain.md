# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the one glossary, grouped by area. Read the areas relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

This repo has one language, so there is no `CONTEXT-MAP.md`. Keep it that way: add a term under the area it belongs to, and add an area rather than a second `CONTEXT.md`.

## What a CONTEXT.md holds

Terms, each defined in one or two sentences as what it _is_; `_Avoid_` lists the synonyms not to use. Nothing else — when writing to one, put everything else where it belongs:

| Not a definition                                             | Goes in                                      |
| ------------------------------------------------------------ | -------------------------------------------- |
| Paths, interfaces, methods, what is fetched when             | The module's interface doc comments          |
| "The one place X is computed", "never do Y outside Z"        | `CODING_STANDARDS.md`                        |
| Thresholds, formulas, fallback orders, edge cases            | The code that applies them, pinned by a test |
| Why it is this way, what it replaced, what was measured      | An ADR, or a comment on the code it explains |
| Intervals.icu quirks — misleading fields, what the API omits | The code that parses the field               |

A glossary entry that needs a paragraph is usually a module's description or a decision; move it rather than grow the entry.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
