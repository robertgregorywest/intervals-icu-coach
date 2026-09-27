import type { IEventsApi } from "../events/index.js";
import type { IWellnessApi } from "../wellness/index.js";
import type { SportSetting } from "../athlete/index.js";
import { readPrescription } from "../prescription/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import type { IntervalsEvent, WorkoutDoc } from "../../types.js";
import { deriveLoad } from "./load.js";
import {
  DEFAULT_ATL_DAYS,
  DEFAULT_CTL_DAYS,
  RAMP_LOOKBACK_DAYS,
  dateRange,
  project,
  shiftDate,
} from "./trajectory.js";
import { mondayOf } from "../../dates.js";
import type {
  ForecastBasis,
  ForecastOptions,
  ForecastResult,
  ForecastSession,
  ForecastWeek,
  ITrainingLoadForecast,
  ProposedSession,
} from "./types.js";

/**
 * Sports Intervals.icu assigns no training load to, and excludes from its own
 * projection. Every `WeightTraining` event and activity on the account carries
 * `icu_training_load: null`. The forecast does the same rather than inventing a
 * figure that would make every number diverge from the dashboard.
 */
const UNMODELLED_SPORTS = new Set(["WeightTraining"]);

const STRENGTH_NOTE =
  "Strength sessions contribute no load, matching Intervals.icu, which assigns " +
  "none either. A block running two gym sessions a week is therefore " +
  "under-read on fatigue by this forecast — a stated limit, not a modelling claim.";

export interface ForecastDeps {
  eventsApi: IEventsApi;
  wellnessApi: IWellnessApi;
  anchors: IAthleteAnchors;
}

export class TrainingLoadForecast implements ITrainingLoadForecast {
  private deps: ForecastDeps;

  constructor(deps: ForecastDeps) {
    this.deps = deps;
  }

  async forecastTrainingLoad(
    options: ForecastOptions
  ): Promise<ForecastResult> {
    const { oldest, newest } = options;
    if (newest < oldest) {
      throw new Error(
        `newest (${newest}) must be on or after oldest (${oldest})`
      );
    }

    // The seed is the last delivered day before the window; ramp needs a week
    // of fitness behind that again.
    const seedDate = shiftDate(oldest, -1);
    const historyStart = shiftDate(seedDate, -RAMP_LOOKBACK_DAYS);

    const [athlete, events, wellness] = await Promise.all([
      this.deps.anchors.getAthleteAnchors(),
      this.deps.eventsApi.getEvents(oldest, newest),
      this.deps.wellnessApi.getWellness(historyStart, seedDate),
    ]);

    const { cycling, ftp: athleteFtp, powerZones } = athlete;
    const ftp = options.ftp ?? athleteFtp;
    if (!ftp || ftp <= 0) {
      throw new Error(
        "No FTP available to resolve targets against — set one on the " +
          "athlete's cycling sport settings or pass one with the forecast."
      );
    }
    const anchors = { ftp, powerZones };

    const settingsCtl = numberOrNull(cycling, "ctl_days");
    const settingsAtl = numberOrNull(cycling, "atl_days");
    const constants = {
      ctlDays: settingsCtl ?? DEFAULT_CTL_DAYS,
      atlDays: settingsAtl ?? DEFAULT_ATL_DAYS,
    };

    const seedRecord = wellness.find((w) => w.id === seedDate);
    const seed =
      options.seed ??
      (seedRecord ? { ctl: seedRecord.ctl, atl: seedRecord.atl } : undefined);
    if (!seed) {
      throw new Error(
        `No delivered wellness record for ${seedDate} to seed from. Supply a ` +
          "starting fitness and fatigue instead."
      );
    }

    const sessions = this.assembleSessions(
      events,
      options.sessions ?? [],
      anchors,
      oldest,
      newest
    );

    const loadByDate = new Map<string, number>();
    for (const s of sessions) {
      loadByDate.set(s.date, (loadByDate.get(s.date) ?? 0) + s.load);
    }

    const dates = dateRange(oldest, newest);
    const days = project(
      seed,
      dates.map((date) => ({ date, load: loadByDate.get(date) ?? 0 })),
      constants,
      // Delivered fitness behind the window, so day one's ramp is measured
      // against what actually happened rather than being withheld for a week.
      wellness
        .map((w) => ({ date: w.id, ctl: w.ctl }))
        .concat({
          date: seedDate,
          ctl: seed.ctl,
        })
    );

    const basis: ForecastBasis = {
      ftp,
      ftpSource: options.ftp ? "caller-supplied" : "athlete-sport-settings",
      powerZones: anchors.powerZones,
      ctlDays: constants.ctlDays,
      atlDays: constants.atlDays,
      timeConstantsSource:
        settingsCtl !== null || settingsAtl !== null
          ? "athlete-sport-settings"
          : "platform-defaults",
      seedDate,
      seedSource: options.seed ? "caller-supplied" : "delivered-wellness",
      seedCtl: seed.ctl,
      seedAtl: seed.atl,
      historyDays: wellness.length,
    };

    return {
      oldest,
      newest,
      basis,
      days,
      weeks: rollUpWeeks(days, sessions, seed.ctl, oldest, newest),
      sessions,
      notes: [STRENGTH_NOTE],
    };
  }

  /**
   * Planned events across the window with the proposed sessions overlaid on
   * them by date. A date carrying a proposed session drops whatever the
   * calendar had for it — a replanned day is replanned, not doubled.
   */
  private assembleSessions(
    events: IntervalsEvent[],
    proposed: ProposedSession[],
    anchors: { ftp: number; powerZones: number[] | null },
    oldest: string,
    newest: string
  ): ForecastSession[] {
    const replaced = new Set(proposed.map((p) => p.date));

    const planned = events
      .filter((e) => e.category !== "NOTE")
      .map((e) => ({ event: e, date: e.start_date_local.slice(0, 10) }))
      .filter(
        ({ date }) => date >= oldest && date <= newest && !replaced.has(date)
      )
      .map(({ event, date }) => this.fromEvent(event, date, anchors));

    const overlaid = proposed
      .filter((p) => p.date >= oldest && p.date <= newest)
      .map((p) => this.fromProposed(p, anchors));

    return [...planned, ...overlaid].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  private fromEvent(
    event: IntervalsEvent,
    date: string,
    anchors: { ftp: number; powerZones: number[] | null }
  ): ForecastSession {
    const base = {
      date,
      name: event.name,
      type: event.type,
      eventId: event.id,
      origin: "planned" as const,
      durationSeconds: event.moving_time ?? event.workout_doc?.duration,
    };

    if (UNMODELLED_SPORTS.has(event.type)) {
      return { ...base, load: 0, source: "unmodelled-strength" };
    }

    // The platform's own figure beats a reproduction of it, and it keeps the
    // forecast anchored to the dashboard the athlete reads.
    if (typeof event.icu_training_load === "number") {
      return { ...base, load: event.icu_training_load, source: "platform" };
    }

    const derived = this.derive(event.workout_doc, event.description, anchors);
    if (!derived) {
      return {
        ...base,
        load: 0,
        source: "underivable",
        note:
          "The platform assigned no load and the prescription could not be " +
          "resolved to watts, so this session contributes none.",
      };
    }
    return { ...base, ...derived };
  }

  private fromProposed(
    session: ProposedSession,
    anchors: { ftp: number; powerZones: number[] | null }
  ): ForecastSession {
    const base = {
      date: session.date,
      name: session.name,
      type: session.type ?? "Ride",
      origin: "proposed" as const,
    };

    if (UNMODELLED_SPORTS.has(session.type ?? "")) {
      return {
        ...base,
        load: 0,
        durationSeconds: session.durationSeconds,
        source: "unmodelled-strength",
      };
    }

    if (session.description) {
      const derived = this.derive(undefined, session.description, anchors);
      if (derived) return { ...base, ...derived };
      return {
        ...base,
        load: 0,
        durationSeconds: session.durationSeconds,
        source: "underivable",
        note:
          "No step in this prescription could be resolved to watts, so it " +
          "contributes no load. Give absolute watts, or supply a load figure.",
      };
    }

    if (typeof session.load === "number") {
      return {
        ...base,
        load: Math.round(session.load),
        durationSeconds: session.durationSeconds,
        source: "caller-supplied",
      };
    }

    return {
      ...base,
      load: 0,
      durationSeconds: session.durationSeconds,
      source: "underivable",
      note: "Session carries neither a workout description nor a load figure.",
    };
  }

  /**
   * Cost a prescription. Prefers the platform's own parsed document when the
   * event carries one, and falls back to parsing the text locally — which is
   * the whole point for a session that has never been written.
   */
  private derive(
    doc: WorkoutDoc | undefined,
    description: string | undefined,
    anchors: { ftp: number; powerZones: number[] | null }
  ):
    | Pick<
        ForecastSession,
        | "load"
        | "durationSeconds"
        | "source"
        | "normalizedPower"
        | "intensityFactor"
        | "gaps"
      >
    | undefined {
    const source = doc ?? description;
    if (!source) return undefined;

    const { steps } = readPrescription(source, anchors);
    const derived = deriveLoad(steps, anchors.ftp);
    if (!derived) return undefined;

    return {
      // Rounded to the whole point the platform stores, and fed into the model
      // that way, so the forecast is a preview of the dashboard rather than a
      // parallel arithmetic that drifts from it by a fraction a day.
      load: Math.round(derived.load),
      durationSeconds: derived.durationSeconds,
      source: "local-parse",
      normalizedPower: derived.normalizedPower,
      intensityFactor: derived.intensityFactor,
      ...(derived.gaps.length > 0 ? { gaps: derived.gaps } : {}),
    };
  }
}

export function createTrainingLoadForecast(
  deps: ForecastDeps
): TrainingLoadForecast {
  return new TrainingLoadForecast(deps);
}

/**
 * Weeks run Monday to Sunday, the frame the coaching layer plans in. A week the
 * window only partly covers is reported and flagged rather than dropped: its
 * load is real, its ramp is not comparable to a full week's.
 */
function rollUpWeeks(
  days: ForecastResult["days"],
  sessions: ForecastSession[],
  seedCtl: number,
  oldest: string,
  newest: string
): ForecastWeek[] {
  const durationByDate = new Map<string, number>();
  for (const s of sessions) {
    if (s.durationSeconds === undefined) continue;
    durationByDate.set(
      s.date,
      (durationByDate.get(s.date) ?? 0) + s.durationSeconds
    );
  }

  const weeks = new Map<string, ForecastResult["days"]>();
  for (const day of days) {
    const start = mondayOf(day.date);
    const bucket = weeks.get(start) ?? [];
    bucket.push(day);
    weeks.set(start, bucket);
  }

  let previousCtl = seedCtl;
  return [...weeks.entries()].map(([weekStart, bucket]) => {
    const ctlStart = previousCtl;
    const ctlEnd = bucket.at(-1)!.ctl;
    previousCtl = ctlEnd;
    const weekEnd = shiftDate(weekStart, 6);
    return {
      weekStart,
      weekEnd,
      load: bucket.reduce((sum, d) => sum + d.load, 0),
      durationSeconds: bucket.reduce(
        (sum, d) => sum + (durationByDate.get(d.date) ?? 0),
        0
      ),
      ctlStart,
      ctlEnd,
      ramp: ctlEnd - ctlStart,
      complete: weekStart >= oldest && weekEnd <= newest,
    };
  });
}

function numberOrNull(
  settings: SportSetting | undefined,
  key: string
): number | null {
  const value = settings?.[key];
  return typeof value === "number" && value > 0 ? value : null;
}
