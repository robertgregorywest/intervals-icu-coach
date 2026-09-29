/**
 * An **activity ID** as Intervals.icu writes it: `i` followed by digits. The
 * API also answers to the bare number, so every input is normalised here —
 * by a tool's schema and by the services that take an ID from elsewhere.
 */

/** Accepts the bare number the API also answers to, and adds the `i` prefix. */
export function normalizeActivityId(id: string | number): string {
  if (typeof id === "number") return `i${id}`;
  return id.startsWith("i") ? id : `i${id}`;
}
