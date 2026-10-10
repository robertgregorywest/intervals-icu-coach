import { query } from "@anthropic-ai/claude-agent-sdk";
import type { GradeOutcome } from "./types.js";

const VOTES = 3;

const SYSTEM = `You grade one output from an AI cycling coach against a rubric.
Judge only what the rubric asks; formatting differences do not decide the verdict.
Reply with a single JSON object and nothing else:
{"verdict": "PASS" | "FAIL", "reason": "<one sentence>"}`;

interface Vote {
  verdict: "PASS" | "FAIL" | "UNPARSEABLE";
  reason: string;
  costUsd: number;
}

async function vote(model: string, prompt: string): Promise<Vote> {
  let text = "";
  let costUsd = 0;
  for await (const m of query({
    prompt,
    options: {
      model,
      systemPrompt: SYSTEM,
      settingSources: [],
      maxTurns: 1,
      permissionMode: "dontAsk",
      allowedTools: [],
      // One-shot vote; keep it out of ~/.claude/projects.
      persistSession: false,
    },
  })) {
    if (m.type === "result") {
      costUsd = m.total_cost_usd;
      if (m.subtype === "success") text = m.result;
    }
  }
  const json = text.match(/\{[\s\S]*\}/)?.[0];
  try {
    const parsed = JSON.parse(json ?? "") as {
      verdict?: string;
      reason?: string;
    };
    const verdict = parsed.verdict?.toUpperCase();
    if (verdict === "PASS" || verdict === "FAIL") {
      return { verdict, reason: parsed.reason ?? "", costUsd };
    }
  } catch {
    // fall through
  }
  return { verdict: "UNPARSEABLE", reason: text.slice(0, 200), costUsd };
}

/**
 * Majority of `votes` from the pinned judge model — three for a whole rubric,
 * one for a single Noul check the Noul could not settle.
 */
export async function judge(
  model: string,
  criteria: string,
  output: string,
  votes = VOTES
): Promise<GradeOutcome> {
  const prompt = `## Rubric\n\n${criteria.trim()}\n\n## Output to grade\n\n${output.trim() || "(empty)"}`;
  const cast = await Promise.all(
    Array.from({ length: votes }, () => vote(model, prompt))
  );
  const passes = cast.filter((v) => v.verdict === "PASS").length;
  const passed = passes * 2 > votes;
  const deciding = cast.find((v) => (v.verdict === "PASS") === passed);
  return {
    passed,
    explanation: `${passes}/${votes} PASS — ${deciding?.reason ?? cast[0].reason}`,
    costUsd: cast.reduce((s, v) => s + v.costUsd, 0),
  };
}
