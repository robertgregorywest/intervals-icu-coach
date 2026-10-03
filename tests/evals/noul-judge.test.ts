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
    const out = await noulJudge(checks, "reply", { ts });
    expect(out.passed).toBe(true);
    expect(out.explanation).toMatch(/^2\/2 checks pass/);
  });

  it("fails on one check below its own threshold, naming it", async () => {
    const { ts } = stub([0.9, 0.7]);
    const out = await noulJudge(checks, "reply", { ts });
    expect(out.passed).toBe(false);
    expect(out.explanation).toContain("FAIL p=0.70 (≥0.8) Does it keep");
    expect(out.explanation).not.toContain("session's date");
  });

  it("asks every check in one request over the output and context", async () => {
    const { ts, bodies } = stub([1, 1]);
    await noulJudge(checks, "  reply  ", {
      context: "FTP is 280 W",
      ts,
    });
    expect(bodies).toHaveLength(1);
    expect(bodies[0].state).toEqual({
      context: "FTP is 280 W",
      output: "reply",
    });
    expect(Object.keys(bodies[0].questions)).toEqual(["check0", "check1"]);
    expect(bodies[0].questions.check0.instructions).toContain("`context`");
  });

  describe("with a floor", () => {
    const banded = [
      {
        question: "Does it name the session's date?",
        threshold: 0.7,
        floor: 0.3,
      },
      {
        question: "Does it keep the dose under the cap?",
        threshold: 0.7,
        floor: 0.3,
      },
    ];

    /** An escalation that records what it was asked and returns `passed`. */
    function judgeVote(passed: boolean) {
      const asked: string[] = [];
      const escalate = async (c: { question: string }) => {
        asked.push(c.question);
        return { passed, explanation: "1/1 PASS — ok", costUsd: 0.02 };
      };
      return { asked, escalate };
    }

    it("settles checks outside the band without the judge", async () => {
      const { ts } = stub([0.9, 0.2]);
      const { asked, escalate } = judgeVote(true);
      const out = await noulJudge(banded, "reply", { escalate, ts });
      expect(asked).toEqual([]);
      expect(out.passed).toBe(false);
      expect(out.costUsd).toBeUndefined();
      expect(out.explanation).toContain("FAIL p=0.20 (≤0.3 fail, ≥0.7 pass)");
    });

    it("hands only the unsettled check to the judge, whose vote decides it", async () => {
      const { ts } = stub([0.9, 0.5]);
      const { asked, escalate } = judgeVote(true);
      const out = await noulJudge(banded, "reply", { escalate, ts });
      expect(asked).toEqual(["Does it keep the dose under the cap?"]);
      expect(out.passed).toBe(true);
      expect(out.costUsd).toBe(0.02);
      expect(out.explanation).toContain("p=0.50");
      expect(out.explanation).toContain("→ judge 1/1 PASS");
    });

    it("fails the run when the judge fails the unsettled check", async () => {
      const { ts } = stub([0.9, 0.5]);
      const { escalate } = judgeVote(false);
      const out = await noulJudge(banded, "reply", { escalate, ts });
      expect(out.passed).toBe(false);
      expect(out.explanation).toContain("FAIL p=0.50");
    });

    it("fails below the threshold when nothing can escalate", async () => {
      const { ts } = stub([0.9, 0.5]);
      const out = await noulJudge(banded, "reply", { ts });
      expect(out.passed).toBe(false);
    });
  });
});
