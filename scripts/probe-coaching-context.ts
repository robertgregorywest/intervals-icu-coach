#!/usr/bin/env tsx
/**
 * Reproduce GitHub issue #2: get_coaching_context with days=14 fails.
 * Drives the actual handler against the live account and validates output
 * with the tool's output schema to surface the exact mismatch.
 */
import "dotenv/config";
import { createServices } from "../src/index.js";
import {
  getCoachingContext,
  getCoachingContextOutputSchema,
} from "../src/mcp/tools/coaching-context.js";

async function main() {
  const services = createServices();

  for (const days of [undefined, 7, 14, 30]) {
    console.log(
      "\n" + "=".repeat(70) + "\n" + `days=${days}\n` + "=".repeat(70)
    );
    let raw: unknown;
    try {
      raw = await getCoachingContext(
        services,
        days === undefined ? {} : { days }
      );
    } catch (e) {
      console.log("HANDLER THREW:", (e as Error).message);
      continue;
    }

    const parsed = getCoachingContextOutputSchema.safeParse(raw);
    if (parsed.success) {
      const ctx = parsed.data;
      console.log(
        `OK — wellnessTrend.length=${ctx.wellnessTrend.length}, daysWindow=${ctx.daysWindow}`
      );
    } else {
      console.log("SCHEMA VALIDATION FAILED:");
      for (const issue of parsed.error.issues) {
        console.log(
          `  path=${issue.path.join(".")}  code=${issue.code}  msg=${issue.message}`
        );
        // print the offending value
        let cur: unknown = raw;
        for (const seg of issue.path) {
          cur = (cur as Record<string | number, unknown>)?.[seg];
        }
        console.log(
          `    actual=${typeof cur === "string" ? `"${cur}"` : JSON.stringify(cur)?.slice(0, 200)}`
        );
      }
    }
  }
}

main().catch((err) => {
  console.error("FAIL:", err);
  process.exit(1);
});
