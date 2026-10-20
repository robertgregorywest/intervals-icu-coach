import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fitCrc } from "../../../src/services/fit/crc.js";

/** Real bytes from a Wahoo ELEMNT BOLT, CRCs as the device wrote them. */
function fixture(): Uint8Array {
  const path = fileURLToPath(
    new URL(
      "../../fixtures/drivetrain-speed/track-2026-07-12-run-1.fit",
      import.meta.url
    )
  );
  return new Uint8Array(readFileSync(path));
}

describe("fitCrc", () => {
  it("reproduces the header and file CRCs a device wrote", () => {
    const bytes = fixture();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect(fitCrc(bytes, 0, 12)).toBe(view.getUint16(12, true));
    expect(fitCrc(bytes, 0, bytes.length - 2)).toBe(
      view.getUint16(bytes.length - 2, true)
    );
  });
});
