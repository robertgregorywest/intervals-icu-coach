import { describe, it, expect } from "vitest";
import { normalizeActivityId } from "../../src/shared/activity-id.js";

describe("normalizeActivityId", () => {
  it("prefixes a bare id and leaves a prefixed one alone", () => {
    expect(normalizeActivityId(173732945)).toBe("i173732945");
    expect(normalizeActivityId("173732945")).toBe("i173732945");
    expect(normalizeActivityId("i173732945")).toBe("i173732945");
  });
});
