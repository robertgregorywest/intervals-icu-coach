import { describe, it, expect, vi } from "vitest";
import { getSubmaxFatigueTestsTool } from "../../src/tools/submax-fatigue.js";
import type { IServices } from "../../src/index.js";

describe("get_submax_fatigue_tests tool", () => {
  it("passes the range straight to the analysis", async () => {
    const result = { tests: [], summary: {} };
    const getSubmaxFatigueTests = vi.fn().mockResolvedValue(result);
    const services = {
      analysis: { getSubmaxFatigueTests },
    } as unknown as IServices;
    const args = getSubmaxFatigueTestsTool.schema.parse({
      oldest: "2026-09-28",
      newest: "2026-10-11",
    });
    expect(await getSubmaxFatigueTestsTool.handler(services, args)).toBe(
      result
    );
    expect(getSubmaxFatigueTests).toHaveBeenCalledWith(
      "2026-09-28",
      "2026-10-11"
    );
  });

  it("quotes its limits from the constants", () => {
    const text = getSubmaxFatigueTestsTool.description;
    for (const fact of [
      "2%",
      "CV ≤ 10",
      "28 days",
      "fewer than 6",
      "below 4",
    ]) {
      expect(text).toContain(fact);
    }
  });
});
