import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { noul, TypeSafeClient, type NoulQuestion } from "@typesafe-ai/sdk";
import { parse as parseDotenv } from "dotenv";
import type { GradeOutcome } from "./types.js";

const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** One yes/no condition a passing output meets, phrased so yes is a pass. */
export interface NoulCheck {
  question: string;
  yes?: string;
  no?: string;
  /** The least yes-probability that passes. */
  threshold: number;
}

let shared: TypeSafeClient | undefined;

/** The key from the shell, else the repo `.env`, as `run.ts` reads its own. */
function client(): TypeSafeClient {
  if (!shared) {
    let apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) {
      try {
        apiKey = parseDotenv(
          readFileSync(join(REPO_ROOT, ".env"))
        ).TYPESAFE_API_KEY;
      } catch {
        // no .env: the client reports the missing key
      }
    }
    shared = new TypeSafeClient({ apiKey });
  }
  return shared;
}

/**
 * Every check asked as its own Noul over the same output, in one request: they
 * run in parallel and none sees another's answer. Passes when each check's
 * yes-probability reaches its threshold.
 */
export async function noulJudge(
  checks: NoulCheck[],
  output: string,
  context?: string,
  ts: TypeSafeClient = client()
): Promise<GradeOutcome> {
  const questions: Record<string, NoulQuestion> = Object.fromEntries(
    checks.map((c, i) => [
      `check${i}`,
      noul(
        `Judging only \`output\`${context ? ", with `context` as the facts it should agree with" : ""}: ${c.question}`,
        c.yes || c.no ? { true: c.yes ?? null, false: c.no ?? null } : null
      ),
    ])
  );
  const state = {
    ...(context ? { context: context.trim() } : {}),
    output: output.trim() || "(empty)",
  };
  const { answers, usage } = await ts.systemOne({ state, questions });
  const results = checks.map((c, i) => {
    const p = answers[`check${i}`].noul;
    return { c, p, passed: p >= c.threshold };
  });
  const failed = results.filter((r) => !r.passed);
  const shown = failed.length ? failed : results;
  return {
    passed: failed.length === 0,
    explanation:
      `${results.length - failed.length}/${results.length} checks pass — ` +
      shown
        .map(
          (r) =>
            `${r.passed ? "" : "FAIL "}p=${r.p.toFixed(2)} (≥${r.c.threshold}) ${r.c.question}`
        )
        .join("; ") +
      ` [${usage.input_tokens} in / ${usage.output_tokens} out tokens]`,
  };
}
