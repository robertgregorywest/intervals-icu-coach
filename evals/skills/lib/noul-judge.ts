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
  /**
   * The most yes-probability that fails outright. A check between this and
   * `threshold` is one the Noul could not settle, and goes to `escalate`;
   * absent, everything below `threshold` fails.
   */
  floor?: number;
}

export interface NoulJudgeOptions {
  /** The facts the output should agree with. */
  context?: string;
  /** Settles one unsettled check — in the grader, a single judge vote. */
  escalate?: (check: NoulCheck) => Promise<GradeOutcome>;
  ts?: TypeSafeClient;
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
 * run in parallel and none sees another's answer. A check passes at or above
 * its threshold, fails at or below its floor, and in between is escalated —
 * so the expensive judge is paid only for the checks the Noul left open.
 */
export async function noulJudge(
  checks: NoulCheck[],
  output: string,
  { context, escalate, ts = client() }: NoulJudgeOptions = {}
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
  const results = await Promise.all(
    checks.map(async (c, i) => {
      const p = answers[`check${i}`].noul;
      const open =
        escalate && c.floor !== undefined && p > c.floor && p < c.threshold;
      if (!open) {
        return { c, p, passed: p >= c.threshold, escalated: undefined };
      }
      const escalated = await escalate(c);
      return { c, p, passed: escalated.passed, escalated };
    })
  );
  const failed = results.filter((r) => !r.passed);
  const shown = failed.length ? failed : results;
  const costUsd = results.reduce((s, r) => s + (r.escalated?.costUsd ?? 0), 0);
  return {
    passed: failed.length === 0,
    explanation:
      `${results.length - failed.length}/${results.length} checks pass — ` +
      shown
        .map((r) => {
          const band =
            r.c.floor !== undefined
              ? `(≤${r.c.floor} fail, ≥${r.c.threshold} pass)`
              : `(≥${r.c.threshold})`;
          const judged = r.escalated
            ? ` → judge ${r.escalated.explanation}`
            : "";
          return `${r.passed ? "" : "FAIL "}p=${r.p.toFixed(2)} ${band} ${r.c.question}${judged}`;
        })
        .join("; ") +
      ` [${usage.input_tokens} in / ${usage.output_tokens} out tokens]`,
    ...(costUsd > 0 ? { costUsd } : {}),
  };
}
