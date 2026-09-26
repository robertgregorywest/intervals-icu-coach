export type {
  AeroPosition,
  AllometricResult,
  CompoundBand,
  CompoundResult,
  Discipline,
  FtpCheck,
  FtpStatus,
  InputField,
  InputSource,
  MapBandResult,
  PowerProfileOverrides,
  PowerProfileResult,
  PstsResult,
  RaceEstimateRow,
  ResolvedInputs,
  RiderTypeResult,
  Sex,
  StrengthFrequency,
  TpProfileRow,
  TrainingHistory,
  TtEstimateRow,
  Vo2Result,
  ZoneRow,
} from "./types.js";

export {
  computePowerProfile,
  computeZones,
  computeFtpCheck,
  computePstsSection,
  computeCompound,
  computeVo2,
  computeAllometric,
  computeTpProfile,
  computeRiderType,
  computeMapBand,
  computeTtEstimates,
  computeRaceEstimates,
} from "./compute.js";

export { resolveInputs, extractPeaks } from "./inputs.js";
export type { PowerProfileDeps, ResolveOptions } from "./inputs.js";

import { computePowerProfile } from "./compute.js";
import { resolveInputs } from "./inputs.js";
import type { PowerProfileDeps, ResolveOptions } from "./inputs.js";
import type { PowerProfileOverrides, PowerProfileResult } from "./types.js";

export async function computePowerProfileWith(
  deps: PowerProfileDeps,
  overrides: PowerProfileOverrides = {},
  opts: ResolveOptions = {}
): Promise<PowerProfileResult> {
  const inputs = await resolveInputs(deps, overrides, opts);
  return computePowerProfile(inputs);
}

export interface IPowerProfile {
  computePowerProfile(
    overrides?: PowerProfileOverrides
  ): Promise<PowerProfileResult>;
}

export function createPowerProfile(
  deps: PowerProfileDeps & { today: () => string }
): IPowerProfile {
  return {
    computePowerProfile: (overrides) =>
      computePowerProfileWith(deps, overrides, { today: deps.today() }),
  };
}
