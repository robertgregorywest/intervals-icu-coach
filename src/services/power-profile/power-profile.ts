import { computePowerProfile } from "./compute.js";
import { resolveInputs } from "./inputs.js";
import type { PowerProfileDeps } from "./inputs.js";
import type { PowerProfileOverrides, PowerProfileResult } from "./types.js";

export interface IPowerProfile {
  computePowerProfile(
    overrides?: PowerProfileOverrides
  ): Promise<PowerProfileResult>;
}

export function createPowerProfile(
  deps: PowerProfileDeps & { today: () => string }
): IPowerProfile {
  return {
    computePowerProfile: async (overrides = {}) =>
      computePowerProfile(
        await resolveInputs(deps, overrides, { today: deps.today() })
      ),
  };
}
