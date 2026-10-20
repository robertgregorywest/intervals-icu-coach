import { describe, it, expect } from "vitest";
import { computeMapZones } from "../../src/shared/map-zones.js";

describe("computeMapZones", () => {
  it("returns the nine CycleCoach zones, in order", () => {
    expect(computeMapZones(360, null).map((z) => z.name)).toEqual([
      "REC",
      "L1",
      "L2",
      "L3",
      "L4",
      "L5",
      "L6",
      "L7",
      "NMP",
    ]);
  });

  // Coefficients from https://www.cyclecoach.com/calculator; the zones overlap
  // by design.
  it("states each zone's %MAP span", () => {
    expect(computeMapZones(360, null).map((z) => z.pctText)).toEqual([
      "0–40%",
      "40–55%",
      "50–65%",
      "60–70%",
      "65–75%",
      "70–85%",
      "80–110%",
      "110–150%",
      "150%+",
    ]);
  });

  it("anchors the watts on MAP, to the watt", () => {
    const zones = computeMapZones(360, null);
    expect(zones[0]).toMatchObject({
      name: "REC",
      lowW: 0,
      highW: 144,
      lowPct: 0,
      highPct: 40,
      wattText: "0–144 W",
    });
    expect(zones[6]).toMatchObject({ lowW: 288, highW: 396, lowPct: 80 });
    expect(zones[7]).toMatchObject({ name: "L7", lowW: 396, highW: 540 });
  });

  it("leaves NMP open-ended without a 5s peak", () => {
    const nmp = computeMapZones(360, null)[8];
    expect(nmp.pctText).toBe("150%+");
    expect(nmp.wattText).toBe("540 W and above");
  });

  it("caps NMP's top end at the 5s peak", () => {
    const nmp = computeMapZones(360, 1100.4)[8];
    expect(nmp.highW).toBe(1100);
    expect(nmp.wattText).toBe("540–1100 W");
  });

  it("ignores a 5s peak that doesn't clear NMP's floor", () => {
    for (const p5s of [540, 500]) {
      const nmp = computeMapZones(360, p5s)[8];
      expect(nmp.highW, `p5s ${p5s}`).toBe(720);
      expect(nmp.wattText, `p5s ${p5s}`).toBe("540 W and above");
    }
  });
});
