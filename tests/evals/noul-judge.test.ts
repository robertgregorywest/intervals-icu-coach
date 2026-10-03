import { TypeSafeClient } from "@typesafe-ai/sdk";
import { describe, expect, it } from "vitest";
import { noulJudge } from "../../evals/skills/lib/noul-judge.js";

/** A client whose fetch answers each question with the next probability. */
function stub(probabilities: number[]) {
  const bodies: any[] = [];
  const ts = new TypeSafeClient({
    apiKey: "test",
    retry: { maxRetries: 0 },
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      const answers = Object.fromEntries(
        Object.keys(body.questions).map((k, i) => [
          k,
          { type: "noul", noul: probabilities[i] },
        ])
      );
      return new Response(
        JSON.stringify({
          model: "jev-test",
          answers,
          usage: { input_tokens: 10, output_tokens: 2 },
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    },
  });
  return { ts, bodies };
}

const checks = [
  { question: "Does it name the session's date?", threshold: 0.5 },
  { question: "Does it keep the dose under the cap?", threshold: 0.8 },
];

describe("noulJudge", () => {
  it("passes when every check reaches its threshold", async () => {
    const { ts } = stub([0.9, 0.85]);
    const out = await noulJudge(checks, "reply", undefined, ts);
    expect(out.passed).toBe(true);
    expect(out.explanation).toMatch(/^2\/2 checks pass/);
  });

  it("fails on one check below its own threshold, naming it", async () => {
    const { ts } = stub([0.9, 0.7]);
    const out = await noulJudge(checks, "reply", undefined, ts);
    expect(out.passed).toBe(false);
    expect(out.explanation).toContain("FAIL p=0.70 (≥0.8) Does it keep");
    expect(out.explanation).not.toContain("session's date");
  });

  it("asks every check in one request over the output and context", async () => {
    const { ts, bodies } = stub([1, 1]);
    await noulJudge(checks, "  reply  ", "FTP is 280 W", ts);
    expect(bodies).toHaveLength(1);
    expect(bodies[0].state).toEqual({
      context: "FTP is 280 W",
      output: "reply",
    });
    expect(Object.keys(bodies[0].questions)).toEqual(["check0", "check1"]);
    expect(bodies[0].questions.check0.instructions).toContain("`context`");
  });
});
