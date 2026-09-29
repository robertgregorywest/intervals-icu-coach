# Workout library

Curated workouts tracked as Markdown templates, rendered onto Intervals.icu, and written to the calendar. Covers this module, `src/services/workout-scheduling/` and `templates/`.

One context of this repo's domain language; see the [context map](../../../CONTEXT-MAP.md) for the others and how they relate.

## Language

**Workout template**:
The tracked Markdown file in `templates/` that is the source of truth for one curated workout — frontmatter (identity, folder, purpose, basis) plus a body in Intervals.icu step syntax. Authored by hand; editing one is a commit.
_Avoid_: "seed" or "canonical template" (both imply a one-time initial write, which is exactly what this is not)

**Library workout**:
The materialised copy of a Workout template on Intervals.icu. A **rendered view**, never a source — hand edits to it are overwritten on the next Sync. Every Library workout has a Workout template behind it.
_Avoid_: calling it the workout "in the library" as though it were authoritative

**Sync**:
The single reconcile operation (`sync_workout_library`): render every Workout template at the current anchors and upsert it, matched by its Template marker. Creates what is missing, updates what differs, never deletes.
_Avoid_: "seed" / "refresh" — both named halves of this one operation and are retired

**Workout scheduling module**:
`src/services/workout-scheduling/` — the one way a workout is written to the calendar, behind `IWorkoutScheduling`: a built plan (`create_workout`), a **Library workout** copied verbatim (`schedule_library_workout`) or a strength session (`create_strength_workout`), each returning the written events plus any `unreviewableSteps`; and `update_event`, with the guard that refuses a description change which would collapse a WORKOUT event's structure. Owns the workout-text builder, the single WORKOUT event shape (`mcp-<date>-<slug>` external id) and the unreviewable-step warning, judged at the key-session floor against the **Athlete anchors** — all internal. The warning is best-effort: no FTP, or a failed lookup, writes the workout without it.
_Avoid_: building workout-text or a WORKOUT event in a Tool; calling `createEvents` for a workout outside this module.

**Basis**:
The anchor a template's percentages are read against — MAP or FTP — declared once per template. One basis per template; mixing is a parse error.

**Anchored target**:
A bare percentage in a step line, resolved against the template's Basis at render time. Everything else — literal watts, zones, HR, pace, cadence — is a **literal target**, emitted verbatim and unaffected by anchor changes. A template with no Anchored target needs no Basis and always syncs.

**Template marker**:
The HTML comment carrying a Workout template's identity on its Library workout, so Sync can find the copy it owns. Invisible in the Intervals.icu UI.

**Orphan**:
A marker-bearing Library workout whose Workout template no longer exists. Reported by Sync as a warning; never deleted automatically.

## Relationships

- A **Workout template** is rendered by **Sync** into exactly one **Library workout**, found by its **Template marker**
- A **Library workout** with no **Workout template** is an **Orphan**; a **Workout template** with no **Library workout** is created on the next **Sync**
- An **Anchored target** moves when MAP/FTP moves; a **literal target** does not — that is the whole difference between them
