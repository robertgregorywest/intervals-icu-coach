# Prescription

Workout text or a `workout_doc` turned into resolved **Planned steps** — the contract every downstream lens judges against. Covers this module, `src/services/workout-parser/` and `src/shared/work-words.ts`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Planned step**:
One prescribed step of a workout after repeat blocks have been expanded — the unit of verification. A 3×(12min/4min) block is six Planned steps, each carrying its rep number, so decay across reps is visible. For a written event, read from its `workout_doc` (Intervals.icu's own parse), never re-parsed from the description text; only text that has not been written is parsed locally. Every Planned step comes out of the **Prescription module**.
_Avoid_: "interval" for the planned side — that is the recorded half (see **Delivered interval**)

**Prescription module**:
`src/services/prescription/`, exposed as `IPrescription` — the one pipeline from workout text or a `workout_doc`, plus anchors, to resolved **Planned steps**: parse, zone resolution, flattening, **Work step** role and the single midpoint a band is taken at, each carrying its **Parse basis**. It also holds the key-session floor (a work step at or above 88% of FTP), so the facts derived from the steps — total prescribed time, whether the session is key, and the unclassified steps at or above the floor — are computed once, inside `read()`, rather than by each caller. Every planned-side lens, the `create_workout` warning, the library summary and the `update_event` guard read prescriptions through it.
_Avoid_: re-running any stage of that pipeline outside it, or writing another midpoint.

**Work step**:
A **Planned step** that carries the session's prescribed intent, as against one that serves it (warm-up, recovery, cool-down). **Declared by the step's author in the first word of its own label**, against the **Work-word vocabulary** — not inferred from intensity, and not read from the delivered `type` field, which is auto-detected and unreliable. Every other step is _unclassified_ and is judged by nothing: a support step and a label outside the vocabulary fall out the same way. See ADR 0010.
_Avoid_: re-deriving the role from prescribed intensity and structural position, which is what the vocabulary replaced; reading an unclassified step as a support step — it may be work whose label fell outside the vocabulary, which is what `unclassifiedSteps` exists to surface.

**Work-word vocabulary**:
The closed list of first words that declare a **Work step**, held in `src/shared/work-words.ts` — a shared file rather than a module, because it is a contract between the authoring side (the `create_workout` schema lists it) and the reading side (the **Prescription module** classifies labels against it). Every entry earns its place from a label the athlete's templates or calendar already use, so a step stays human-readable on the head unit while being deterministic to classify. Adding a word is a deliberate edit; an unrecognised word costs a step's **Verdict** rather than inventing one. `endurance` and `steady` are deliberately absent — a volume block is read by the **Intensity distribution**, not rep by rep.
_Avoid_: matching anywhere but the label's first word; treating an unlisted word as a failure, rather than as a step nothing will judge.

## Relationships

- A **Work step** is declared by its author and read as data, never inferred by a Tool from intensity or structure — the step's own label carries the coaching intent, so nothing about intent is ever guessed downstream
- Every step a Tool does not find in the **Work-word vocabulary** is judged by nothing and counted, so a work step with an unrecognised label surfaces as missing coverage rather than as a session that went well
