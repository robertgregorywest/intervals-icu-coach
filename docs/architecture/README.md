# Architecture diagrams

Sources for [Archify](https://github.com/tt-a1i/archify) diagrams. The `*.archify.json` spec is the source of truth; the rendered `*.html` is gitignored — rebuild it locally.

## Deep modules

`deep-modules.archify.json` — the service modules in `src/services/`, their one-line responsibilities, and the layers around them (Tool registry and **Services** above, the thin Intervals.icu API wrappers and `HttpClient` below).

Rebuild:

```bash
node ~/.claude/skills/archify/bin/archify.mjs deliver architecture \
  docs/architecture/deep-modules.archify.json docs/architecture/deep-modules.html --quality showcase
```

Keep in mind when editing:

- The showcase profile rejects crossing or shared edge corridors, so only a representative subset of dependencies is drawn. The rest are stated in the "Deep core" card — keep the card honest when dependencies change.
- `map` and `workout-parser` are folded into **Athlete anchors** and **Prescription**, the only modules that use them.
- Update the diagram when a service is added, merged or split, using the names from `CONTEXT.md`.
