export interface MapInfo {
  watts: number;
  computedFrom: {
    metric: "best_60s";
    activityId: number | string;
    activityName: string;
    activityDate: string;
    daysAgo: number;
  };
}

export interface MapDerivation {
  map: MapInfo | null;
  mapWarning?: string;
}

/** MAP from the athlete's latest ramp test. */
export interface IMap {
  /**
   * The best 60s power of the most recent "MAP ramp test" within the lookback
   * ending `today` (YYYY-MM-DD). Never throws: when MAP cannot be derived,
   * `map` is null and `mapWarning` says why.
   */
  deriveLatest(today: string): Promise<MapDerivation>;
}
