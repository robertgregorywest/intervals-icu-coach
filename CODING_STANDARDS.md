# Coding standards

How code in this repo is written, stated as rules a reviewer can hold a diff against. Where a rule
comes from a decision, the ADR is cited; the domain terms are defined in the
[glossary](./CONTEXT.md). Layout and the dev loop are in
[`docs/architecture/README.md`](./docs/architecture/README.md).

## Already enforced — don't review for these

The pre-commit hook fails the commit, so a diff that landed already passes:

- Formatting (prettier, `.prettierrc`).
- `strict` TypeScript with `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, across
  `src/`, `tests/` and `evals/`.
- Code outside a module imports only its `index.ts`; `src/shared/` imports only itself
  (`npm run check:imports`).
- A module's index exports no runtime value but its `createX` factory and primitive constants
  (`tests/module-indexes.test.ts`).
- Every tool name, permission tier and work word a skill mentions exists in the code
  (`tests/skills-contract.test.ts`).

## Modules and wiring

From [ADR 0014](./docs/adr/0014-modules-behind-interfaces.md).

- **Every module under `src/services/` has an `IX` interface and a `createX(deps)` factory that
  returns the interface**, pure modules included. The class behind it stays internal.
- **Built once, in `createServices`; reached only through `deps`.** No handler or service
  constructs another service, and no consumer imports one to call it directly.
- **Services wires and forwards nothing.** `src/index.ts` holds no logic and no pass-through
  methods.
- **An index exports the interface, the factory, the types the interface uses, and primitive
  constants from the input contract** (such as `MAX_DAYS`) — never a class, helper or error class.
  If a caller needs to branch on how a call failed, return a discriminated result instead.
- **Where a helper goes** — apply the deletion test before choosing:
  - every caller runs it on something the module just returned → behind the module's interface;
  - it only shapes a payload for the model → with the Tool (`src/tools/`);
  - a pure domain primitive needed by two or more modules or tools → `src/shared/`.
    A helper with one user stays inside that module until a second one needs it.
- **`src/shared/` is one file per domain concept, named from the glossary** — never `utils` or
  `helpers`. Its files are pure: no I/O, no `deps`.
- **Top-level `src/` files are infrastructure and wiring only** (composition root, registry, HTTP
  client, config, error rendering, cassette).

## Tools and adapters

- **A Tool is one `defineTool({ … })` in `src/tools/` and one line in `src/registry.ts`.** Both
  adapters pick it up; adding a Tool never edits an adapter ([ADR 0001](./docs/adr/0001-cli-adapter-and-tool-registry.md)).
- **A handler shapes a response and nothing more.** Validation of the input contract, pairing,
  windows, caps and any computation belong in the service. A handler that is more than a call and
  a reshape is a smell.
- **Adapters hold transport concerns only** — wire format, discovery, error rendering. No business
  logic, no shared instructions.
- **Annotations tell the truth.** Pick `READ_ONLY`, `MUTATING`, `DESTRUCTIVE_IDEMPOTENT` or
  `UPSERT` (`src/tools/define.ts`) for what the Tool actually does to Intervals.icu.
- **Reuse `src/tools/common.ts`** field shapes (`dateString`, `activityIdField`, `limitField`, …)
  rather than redeclaring them.

## Knowledge placement

From [ADR 0013](./docs/adr/0013-knowledge-in-schemas-and-skills.md).

- **A Tool's input contract goes in the `.describe()` of the field it governs**, and the Tool
  `description` says what it returns and when to use it.
- **Enforce it in code where possible.** A rule a model could skip in prose becomes a refusal with
  a message that teaches the rule.
- **Generate lists in descriptions from the constant that holds them** (as the label description
  does from `WORK_WORDS`), so the prose cannot drift.
- **Coaching and workout-writing practice goes in a skill**, never in adapter `instructions` or a
  schema.
- **A skill's claim about the code is pinned** in `tests/skills-contract.test.ts` when a new kind
  of claim is added.

## One owner per rule

Each of these is computed in exactly one place. A diff that re-derives one elsewhere — even a
correct copy — is a violation; call the owner. The glossary entry for each says why.

| Rule                                                                                               | Owner                                                                                |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| FTP, weight, power zones, MAP, MAP zones                                                           | **Athlete anchors** (`IAthleteAnchors`, incl. `snapshot`)                            |
| **Plan FTP** — a planned event's FTP fallback                                                      | `src/shared/plan-ftp.ts`                                                             |
| MAP-zone model                                                                                     | `src/shared/map-zones.ts`                                                            |
| Workout text / `workout_doc` → **Planned steps**, midpoints, **Work step** role, key-session floor | **Prescription module** (`IPrescription.read`; a planned event: `readPlanned`)       |
| Work-word vocabulary                                                                               | `src/shared/work-words.ts`                                                           |
| Pairing a planned event to its ride; a review window's day count and cap                           | **Paired session loader** (inside execution-review)                                  |
| Middle-band measurement of a ride                                                                  | `src/shared/middle-band.ts`, via the **Training load module**                        |
| Forecast and trend range caps                                                                      | **Training load module**                                                             |
| Workout text building, the WORKOUT event shape, any calendar write of a workout                    | **Workout scheduling module**                                                        |
| Resolving a **Track input**; alignment; write-back                                                 | **Track module**                                                                     |
| Date-range guard: format, order, inclusive day count, refusal past a cap (the cap is the caller's) | `src/shared/date-range.ts`                                                           |
| Rounding                                                                                           | `src/shared/round.ts`                                                                |
| "Today"                                                                                            | `ServicesOptions.today`, defaulting to `isoToday()` — never `new Date()` in a module |

Within a call, read the anchors once — one `getAthleteAnchors()`, or a `snapshot()` when several
readers need them — and pass the result down, so every lens reads the same FTP, zones and MAP. A
planned event's Prescription is read with `readPlanned`, never by stitching the Plan FTP and `read`
together.

## Intervals.icu data

- **Probe live before typing.** A new request body, response field or query param is shaped from a
  real response (the `intervals-api-research` skill), not from memory.
- **Prefer the platform's own figure** where it exists (a written event's `workout_doc`, a
  computed load) over a local reproduction; reproduce only what the platform has not computed.
- **Report provenance.** A result derived from a choice — which record, which parse, which power
  figure, how steps were paired — carries a field saying which (`alignmentBasis`, `verdictBasis`, `executionRecord`, …).
  Don't return a number whose source a caller can't see.
- **Withhold with a reason rather than guess.** When inputs can't support a figure, return `null`
  or omit it with a note; never fill it with a plausible default. Unmatched and unclassified items
  are reported, not dropped.
- **Round at the boundary**, where a value leaves the module, to the precision its source supports.

## Naming

- **Use the glossary's term** for a domain concept in identifiers, types, fields and messages, and
  none of the terms it lists under _Avoid_. A new concept gets a glossary entry before it gets a
  name.
- Interfaces are `IX`, factories `createX`, deps types `XDeps`. Constants that bound an input are
  `MAX_…` / `DEFAULT_…`.
- Relative imports carry the `.js` extension (NodeNext).

## Tests

- **`tests/` mirrors `src/`.** A new source file gets its test at the mirrored path.
- **Substitute through `deps`, never by module mocking.** No `vi.mock`, no global `fetch` stub:
  pass a fake of the interface, or an injected `fetchFn` to `HttpClient`. Use the helpers in
  `tests/helpers/` (`pinnedAnchors`, …) rather than hand-rolling one.
- **Only a module's own tests import its internals.** Every other test goes through the index.
- **Pin what moves.** A test whose expectation depends on the athlete's live anchors or today's
  date pins them; it never reads them.
- Fixtures captured from Intervals.icu are real responses (`scripts/capture-*`), not hand-written
  shapes.

## Comments

- Explain **why** — the constraint, the measured result, the trap — not what the next line does.
  `src/shared/round.ts` is the model.
- Cite the ADR when code exists because of one.
