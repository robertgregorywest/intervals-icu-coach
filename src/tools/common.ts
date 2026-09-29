import { z } from "zod";
import { normalizeActivityId } from "../services/activities/index.js";
import { ZONE_NAMES } from "../services/athlete-anchors/index.js";

export const CHARACTER_LIMIT = 25_000;
export const DEFAULT_LIST_LIMIT = 50;
export const MAX_LIST_LIMIT = 200;
export const MAX_RANGE_DAYS = 365;

export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

/**
 * An activity ID as callers give it — the "i"-prefixed string or a bare number.
 * Handlers receive the normalised string. Add `.describe()` per tool.
 */
export const activityIdField = z
  .union([z.string(), z.number()])
  .transform(normalizeActivityId);

/** An activity ID in a response: not normalised, either form may appear. */
export const idOut = z.union([z.number(), z.string()]);

export const zoneName = z.enum(ZONE_NAMES);

export const externalIdField = z
  .string()
  .optional()
  .describe("Optional external ID for upsert matching");

export const colorField = z
  .string()
  .optional()
  .describe("Optional event color");

export const limitField = z
  .number()
  .int()
  .min(1)
  .max(MAX_LIST_LIMIT)
  .default(DEFAULT_LIST_LIMIT)
  .describe(
    `Maximum results to return (default ${DEFAULT_LIST_LIMIT}, max ${MAX_LIST_LIMIT})`
  );

/**
 * Days from `oldest` to `newest`, exclusive of the last. Throws on an
 * unparseable date or a range that runs backwards.
 */
export function spanDays(oldest: string, newest: string): number {
  const start = Date.parse(oldest);
  const end = Date.parse(newest);
  if (Number.isNaN(start) || Number.isNaN(end)) {
    throw new Error("Invalid date — must be YYYY-MM-DD");
  }
  if (end < start) {
    throw new Error(
      `newest (${newest}) must be on or after oldest (${oldest})`
    );
  }
  return (end - start) / 86_400_000;
}

export function assertDateRange(oldest: string, newest: string): void {
  const days = spanDays(oldest, newest);
  if (days > MAX_RANGE_DAYS) {
    throw new Error(
      `Date range too large: ${Math.round(days)} days (max ${MAX_RANGE_DAYS}). ` +
        "Narrow the range and try again."
    );
  }
}

export function applyLimit<T>(
  items: T[],
  limit: number
): { items: T[]; total: number; truncated: boolean } {
  const total = items.length;
  if (total <= limit) {
    return { items, total, truncated: false };
  }
  return { items: items.slice(0, limit), total, truncated: true };
}

export type Truncation = {
  truncated: true;
  character_limit: number;
  original_chars: number;
  message: string;
};

export function withCharacterLimit<T>(
  payload: T,
  hint: string
): T | Truncation {
  const json = JSON.stringify(payload);
  if (json.length <= CHARACTER_LIMIT) {
    return payload;
  }
  return {
    truncated: true,
    character_limit: CHARACTER_LIMIT,
    original_chars: json.length,
    message: hint,
  };
}

/**
 * Common Zod schemas reused in tool outputSchemas.
 */
export const truncationSchema = z.object({
  truncated: z.literal(true),
  character_limit: z.number(),
  original_chars: z.number(),
  message: z.string(),
});

/**
 * Build a list-envelope outputSchema with a typed items array under the given key.
 */
export function listEnvelopeShape<T extends z.ZodTypeAny>(
  itemsKey: string,
  itemSchema: T
): Record<string, z.ZodTypeAny> {
  return {
    total: z.number(),
    count: z.number(),
    truncated: z.boolean(),
    message: z.string().optional(),
    [itemsKey]: z.array(itemSchema),
  };
}
