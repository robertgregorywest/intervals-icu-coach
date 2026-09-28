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

Top-level shared files in `src/*.ts` — `dates.ts`, `clock.ts`, `types.ts` and the like — are not
modules, and are imported directly.

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

Some indexes — `workout-library`'s among them — still export more than the rule allows. The import
check already holds.
