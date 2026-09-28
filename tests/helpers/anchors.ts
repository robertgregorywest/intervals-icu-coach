import type {
  AthleteAnchors,
  IAthleteAnchors,
  MapAnchors,
} from "../../src/services/athlete-anchors/index.js";

/**
 * Anchors pinned for a test, substituted through `deps` (ADR 0014): the
 * athlete's MAP moves, and a test whose expected seconds move with it is
 * testing nothing. `planFtp` and `snapshot` keep the real module's contract —
 * event FTP, then the ride's, then the athlete's, each athlete read at most
 * once per snapshot — which `tests/services/athlete-anchors/` pins against the
 * real module.
 */
export function pinnedAnchors(
  pinned: {
    athlete?: () => Promise<Partial<AthleteAnchors>>;
    map?: () => Promise<MapAnchors>;
  } = {}
): IAthleteAnchors {
  const athlete = pinned.athlete ?? (async () => ({}));
  const map = pinned.map ?? (async () => ({ map: null, mapZones: null }));
  const anchors: IAthleteAnchors = {
    getAthleteAnchors: async () => ({ ...UNSET, ...(await athlete()) }),
    getMapAnchors: () => map(),
    async planFtp(event, ride) {
      return (
        positive(event?.icu_ftp) ??
        positive(ride?.icu_ftp) ??
        (await anchors.getAthleteAnchors()).ftp
      );
    },
    snapshot() {
      let read: Promise<Partial<AthleteAnchors>> | undefined;
      return pinnedAnchors({ athlete: () => (read ??= athlete()), map });
    },
  };
  return anchors;
}

const UNSET: AthleteAnchors = {
  ftp: null,
  weight: null,
  powerZones: null,
  lthr: null,
  maxHr: null,
  restingHr: null,
  hrZones: null,
  paceZones: null,
  id: null,
  name: null,
  sex: null,
  dateOfBirth: null,
  height: null,
  sportSettings: [],
  cycling: undefined,
};

function positive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
