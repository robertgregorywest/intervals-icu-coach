# Every module is used through an interface, and only through its index

`src/services/` had grown two kinds of module. **Remote** modules — events, activities, track,
execution-review and the rest — expose an `IX` interface and a `createX()` factory, are built once in
`createServices`, and reach their consumers through `deps`. **Pure** modules — `fit`, `map`,
`prescription` — were plain functions imported wherever they were needed, with no interface or
factory, while `workout-parser`, just as pure, already had `IWorkoutParser` and
`createWorkoutParser`. CLAUDE.md described only the first kind. Indexes had drifted too: some
exported concrete classes, second factories and other modules' exports, and nothing stopped code
importing a module's internal files directly.

We made the remote shape the only shape.

- **Every module under `src/services/` exposes an `IX` interface and a `createX()` factory**,
  pure modules included. The factory returns the interface, not the class behind it.
- **Every module is built in `createServices`**, and consumers receive it through `deps`, never by
  importing it.
- **A module's `index.ts` exports only its interface, its factory and the types that interface
  uses.** No concrete classes, no second factories, no re-exports of another module.
- **Code outside a module imports only its `index.ts`.** `npm run check:imports`
  (`scripts/check-imports.ts`) enforces this in the pre-commit hook.

Shared pure helpers are not modules and are imported directly. Where they live, and what else an
index may export, is set out in the amendment below.

## Tests

A module's own tests — `tests/services/<module>/` or `tests/services/<module>.test.ts` — may import
its internals, so a unit test can reach the function it tests. Every other test, and every shared
helper under `tests/helpers/`, goes through the index like production code. A test that needs
another module to behave a particular way substitutes it through `deps` with a fake of its
interface (`tests/helpers/anchors.ts` pins the athlete's anchors this way), rather than mocking at
module level or reaching for a test-only factory.

`scripts/` is not checked: its probes poke at live Intervals.icu through internals on purpose, and
nothing ships from it.

## Consequences

A pure module gets a seam with only one adapter, and a caller that wanted one function now takes the
module through `deps`. In exchange every module has the same shape, a reader knows where to find its
contract, and any module can be substituted in a test by passing a different implementation.

The check is a regex over relative import specifiers, not a compiler pass. It catches every import
this repo writes (`from`, `export … from`, `import "…"`, `import("…")`), and refuses to pass having
scanned nothing.

## Amendment: what an index may export, and where shared helpers live

Most indexes still exported helpers, constants, concrete classes and error classes that other modules
and tools used (#46). Three questions came out of trimming them.

**A helper another module or a tool uses.** Apply the deletion test before choosing a home:

- **If every caller runs it on something the module just returned, it belongs behind the interface.**
  Both users of the power-curve parser fetched the raw curve and then parsed it, so
  `IPowerCurvesApi.getPeaks()` returns the peaks and the parser is internal.
- **If it only shapes a payload for the model, it belongs with the Tool.** Activity compaction and stream
  packing are cut to a character budget that only `get_activity` and `get_activity_streams` care
  about, so they live in `src/tools/activity-payloads.ts`.
- **If it is a pure domain primitive with nothing that varies, needed by two or more modules or
  tools, it belongs in `src/shared/`.** Examples are normalised power, the MAP zones, the middle band,
  the activity ID, the frontmatter reader, dates and rounding. A module and a factory would add a seam
  with one adapter, which nothing ever substitutes. A Tool's schema is built at import time, before
  any service exists, so it could not reach one through `deps` anyway.

`src/shared/` holds one file per domain concept, named from CONTEXT.md, never `utils` or `helpers`.
Its files are pure (no I/O, no `deps`) and import only each other, so `src/shared/` stays below every
module. `npm run check:imports` enforces the import rule. A helper moves there only once a second
module or tool needs it; until then it stays inside its module. Files left at the top of `src/` are
infrastructure and wiring: the composition root, registry, HTTP client, config, error rendering and
cassette.

**Constants a Tool's schema needs.** A limit or default the module enforces, such as `MAX_DAYS` or
`MAX_FORECAST_DAYS`, is part of what a caller must know to call it, which makes it part of the
interface. An index may export such constants, as primitives, beside the factory. Moving them to
`src/shared/` would separate each limit from the code that enforces it.

**Error classes.** No index exports one. Nothing outside a module needed to `instanceof` one: the
adapters render `error.message`, and the only cross-module check was on the frontmatter reader's
error, which now belongs to `src/shared/frontmatter.ts`. A module's own tests import its error
classes from internal files. If a caller ever needs to branch on how a call failed, the module
should return a discriminated result rather than export an error class.

So a module's index exports its interface, its `createX` factory, the types that interface uses, and
primitive constants from its input contract, and every factory returns its interface.
`tests/module-indexes.test.ts` loads every index and fails on any runtime export that is neither a
`createX` factory nor a primitive constant. That catches concrete classes, error classes and helper
functions alike.
