import type { SportSetting } from "../athlete/index.js";
import type { MapInfo } from "../map/index.js";
import type { IntervalsEvent } from "../../types.js";
import type { ZoneRow } from "../../shared/map-zones.js";

/**
 * What the athlete record says, read once and one way: one request, no
 * derivation.
 *
 * Intervals.icu keeps the sport-scoped values — FTP, LTHR, max HR, zones — on
 * the cycling sport settings, not on the athlete record, and the live payload
 * names that list `sportSettings` although the typed profile says
 * `sport_settings`. A top-level field is honoured only where the sport settings
 * carry none. A zero or negative number is an unset field, never an anchor.
 */
export interface AthleteAnchors {
  ftp: number | null;
  weight: number | null;
  /** The cycling FTP zones as %FTP boundaries — for resolving `Z3`-style targets. */
  powerZones: number[] | null;
  lthr: number | null;
  maxHr: number | null;
  restingHr: number | null;
  hrZones: number[] | null;
  paceZones: number[] | null;
  id: string | null;
  name: string | null;
  /** As the record stores it — `M`/`F` in practice. */
  sex: string | null;
  dateOfBirth: string | null;
  /** As the record stores it — metres in practice. */
  height: number | null;
  sportSettings: SportSetting[];
  /** The cycling sport settings, or the first entry when none is cycling. */
  cycling: SportSetting | undefined;
}

/** MAP from the latest ramp test and the MAP zones on it. See ADR 0003. */
export interface MapAnchors {
  map: MapInfo | null;
  /** `null` when MAP is unavailable (see mapWarning). */
  mapZones: ZoneRow[] | null;
  mapWarning?: string;
}

export interface IAthleteAnchors {
  /** The athlete record's anchors — one athlete request. */
  getAthleteAnchors(): Promise<AthleteAnchors>;
  /** MAP and the MAP zones — never touches the athlete record. */
  getMapAnchors(opts?: { today?: string }): Promise<MapAnchors>;
  /**
   * The FTP a planned event's percentages are read against — the one fallback
   * order every lens shares: the event's own FTP, then the FTP the paired ride
   * was recorded at, then the athlete's current FTP.
   *
   * Planned events on Intervals.icu carry no `icu_ftp` in practice, so the
   * ride's FTP is what usually decides. A lens that resolved the same event
   * differently would judge a step against a different target than its
   * neighbour selected it by. The athlete is read only when neither half
   * carries one.
   *
   * A ride with no paired event passes `null`, which skips the event term —
   * the ride's own FTP, then the athlete's.
   */
  planFtp(
    event: Pick<IntervalsEvent, "icu_ftp"> | null,
    ride: { icu_ftp?: unknown } | null | undefined
  ): Promise<number | null>;
  /**
   * The same anchors, each read at most once however often they are asked
   * for. Take one per call, so a caller reading FTP for every session in a
   * window fetches the athlete once — and a later call sees a changed FTP.
   */
  snapshot(): IAthleteAnchors;
}
