/**
 * Today as YYYY-MM-DD (UTC) — the default wherever "today" can be pinned
 * (`ServicesOptions.today`, which the eval harness sets from `ICU_NOW`).
 */
export function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}
