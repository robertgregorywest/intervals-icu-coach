import type { IAthleteApi } from "../athlete/index.js";
import type { IPowerCurvesApi } from "../power-curves/index.js";
import { extractPeaks } from "../power-curves/index.js";
import type { IntervalsEvent } from "../../types.js";
import { isoToday } from "../../clock.js";
import type { IMap } from "../map/index.js";
import { positiveNumber, readAthlete } from "./fields.js";
import { computeMapZones } from "./zones.js";
import type { AthleteAnchors, IAthleteAnchors, MapAnchors } from "./types.js";

export interface AthleteAnchorsDeps {
  athleteApi: IAthleteApi;
  map: IMap;
  powerCurvesApi: IPowerCurvesApi;
  /** "Today" as YYYY-MM-DD; defaults to the system clock (UTC). */
  today?: () => string;
}

/**
 * Where the anchors come from. Intervals.icu in production; pinned values in a
 * test that needs the athlete's MAP not to move under it.
 */
export interface AnchorSources {
  athlete(): Promise<Partial<AthleteAnchors>>;
  map(today: string): Promise<MapAnchors>;
  today(): string;
}

/**
 * The athlete's training anchors, each fetched only as far as it needs.
 *
 * FTP is one athlete request. MAP and its zones are the ramp-test derivation
 * plus the power curve, and never touch the athlete record or wellness — so a
 * caller that wants FTP no longer pays for the coaching context.
 */
class AthleteAnchorsService implements IAthleteAnchors {
  constructor(private sources: AnchorSources) {}

  async getAthleteAnchors(): Promise<AthleteAnchors> {
    return { ...readAthlete(null), ...(await this.sources.athlete()) };
  }

  getMapAnchors(opts: { today?: string } = {}): Promise<MapAnchors> {
    return this.sources.map(opts.today ?? this.sources.today());
  }

  async planFtp(
    event: Pick<IntervalsEvent, "icu_ftp"> | null,
    ride: { icu_ftp?: unknown } | null | undefined
  ): Promise<number | null> {
    return (
      positiveNumber(event as Record<string, unknown> | null, ["icu_ftp"]) ??
      positiveNumber(ride as Record<string, unknown> | undefined, [
        "icu_ftp",
      ]) ??
      (await this.getAthleteAnchors()).ftp
    );
  }

  snapshot(): IAthleteAnchors {
    let athlete: Promise<Partial<AthleteAnchors>> | undefined;
    const maps = new Map<string, Promise<MapAnchors>>();
    const { sources } = this;
    return new AthleteAnchorsService({
      athlete: () => (athlete ??= sources.athlete()),
      map: (today) => {
        let map = maps.get(today);
        if (!map) maps.set(today, (map = sources.map(today)));
        return map;
      },
      today: sources.today,
    });
  }
}

/** The anchors read live from Intervals.icu. */
export function createAthleteAnchors(
  deps: AthleteAnchorsDeps
): IAthleteAnchors {
  return createAthleteAnchorsFrom({
    athlete: async () => readAthlete(await deps.athleteApi.getAthlete()),
    map: (today) => deriveMapAnchors(deps, today),
    today: deps.today ?? isoToday,
  });
}

/** The anchors over any source — pinned values in a test. */
export function createAthleteAnchorsFrom(
  sources: Partial<AnchorSources>
): IAthleteAnchors {
  return new AthleteAnchorsService({
    athlete: sources.athlete ?? (async () => ({})),
    map: sources.map ?? (async () => ({ map: null, mapZones: null })),
    today: sources.today ?? isoToday,
  });
}

/**
 * MAP from the latest ramp test, and the MAP zones anchored on it. The power
 * curve's 5s peak only caps the NMP zone, so a curve that will not load
 * degrades that one cap rather than failing the zones.
 */
async function deriveMapAnchors(
  deps: Pick<AthleteAnchorsDeps, "map" | "powerCurvesApi">,
  today: string
): Promise<MapAnchors> {
  const [{ map, mapWarning }, curveRaw] = await Promise.all([
    deps.map.deriveLatest(today),
    deps.powerCurvesApi
      .getPowerCurve({ range: "90d", type: "Ride" })
      .catch(() => null),
  ]);
  const mapZones = map
    ? computeMapZones(map.watts, extractPeaks(curveRaw).p5s)
    : null;
  return { map, mapZones, ...(mapWarning ? { mapWarning } : {}) };
}
