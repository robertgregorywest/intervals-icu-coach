import type { Activity, IActivitiesApi } from "../activities/index.js";
import type { IEventsApi } from "../events/index.js";
import type { IntervalsEvent } from "../../types.js";
import { shiftDate } from "../../dates.js";
import { executionCandidates } from "../session-review/delivered.js";
import { reviewWindow } from "./window.js";
import type {
  LoadedWindow,
  PairedSession,
  SessionLookup,
  Unpaired,
} from "./types.js";

/**
 * Days either side of a planned event to scan for the ride paired to it. There
 * is no endpoint that filters activities by `paired_event_id`, and a ride paired
 * to an event is dated at or adjacent to it, so a narrow reach is enough.
 */
export const PAIR_SEARCH_WINDOW_DAYS = 2;

export interface PairedSessionDeps {
  activitiesApi: IActivitiesApi;
  eventsApi: IEventsApi;
}

/**
 * The one place a planned event is paired to the ride that executed it.
 *
 * Every execution-review lens reads sessions through here, so they agree on
 * what "this session" means and share one set of fetches: pairing, the window's
 * day count and each ride's intervals, laps and streams are done once however
 * many lenses read them.
 */
export class PairedSessionLoader {
  constructor(private deps: PairedSessionDeps) {}

  /** One session, from whichever half the caller has. */
  async find(options: {
    activityId?: string;
    eventId?: number;
  }): Promise<SessionLookup> {
    const { activityId, eventId } = options;
    if (!!activityId === !!eventId) {
      throw new Error(
        "Supply exactly one of activityId or eventId — the other half of the " +
          "pair is resolved from the activity's paired event."
      );
    }
    return activityId
      ? this.fromActivity(activityId)
      : this.fromEvent(eventId!);
  }

  /**
   * Every session in a **Review window**. Throws before any fetch when the
   * window fails its guard.
   *
   * Rides are listed out to the pairing reach either side, so an event on the
   * window's edge finds the ride that `find` would find for it.
   */
  async loadWindow(options: {
    oldest: string;
    newest: string;
  }): Promise<LoadedWindow> {
    const window = reviewWindow(options.oldest, options.newest);
    const { oldest, newest } = window;
    const { activitiesApi, eventsApi } = this.deps;

    const [events, rides] = await Promise.all([
      eventsApi.getEvents(oldest, newest),
      activitiesApi.getActivities(
        shiftDate(oldest, -PAIR_SEARCH_WINDOW_DAYS),
        shiftDate(newest, PAIR_SEARCH_WINDOW_DAYS)
      ),
    ]);

    const inWindow = (date: string | undefined) => {
      const day = (date ?? "").slice(0, 10);
      return day >= oldest && day <= newest;
    };

    const rideFor = new Map<number, Activity>();
    for (const ride of rides) {
      const id = ride.paired_event_id;
      if (id && !rideFor.has(id)) rideFor.set(id, ride);
    }

    // A ride in the window paired to an event dated outside it is still the
    // window's work, so its event is fetched rather than the ride dropped.
    const listed = new Set(events.map((e) => e.id));
    const strayIds = [
      ...new Set(
        rides
          .filter((r) => inWindow(r.start_date_local))
          .map((r) => r.paired_event_id)
          .filter((id): id is number => !!id && !listed.has(id))
      ),
    ];
    const strays = await Promise.all(
      strayIds.map((id) => eventsApi.getEvent(id))
    );

    const sessions = new Map<number, PairedSession>();
    const unriddenEvents: Unpaired[] = [];
    for (const event of [...events, ...strays]) {
      const ride = event.id !== undefined ? rideFor.get(event.id) : undefined;
      if (ride) {
        sessions.set(event.id!, this.session(event, ride));
      } else if (event.category === "WORKOUT") {
        unriddenEvents.push(unridden(event));
      }
    }

    const unpairedRides = rides
      .filter((r) => !r.paired_event_id && inWindow(r.start_date_local))
      .map(unpaired);

    return {
      window,
      events,
      sessions: [...sessions.values()],
      unpairedRides,
      unriddenEvents,
      lookup: (eventId) => {
        const session = sessions.get(eventId);
        if (session) return { session };
        const event = events.find((e) => e.id === eventId);
        return event ? unridden(event) : unriddenId(eventId);
      },
    };
  }

  /** Activity given: read its recorded pairing and fetch that event. */
  private async fromActivity(activityId: string): Promise<SessionLookup> {
    const activity = await this.deps.activitiesApi.getActivity(
      activityId,
      true
    );
    if (!activity.paired_event_id) return unpaired(activity);

    const event = await this.deps.eventsApi.getEvent(activity.paired_event_id);
    return { session: this.session(event, activity, activity) };
  }

  /** Event given: scan a narrow date window for the ride that points back. */
  private async fromEvent(eventId: number): Promise<SessionLookup> {
    const event = await this.deps.eventsApi.getEvent(eventId);
    const day = (event.start_date_local ?? "").slice(0, 10);

    const rides = day
      ? await this.deps.activitiesApi.getActivities(
          shiftDate(day, -PAIR_SEARCH_WINDOW_DAYS),
          shiftDate(day, PAIR_SEARCH_WINDOW_DAYS)
        )
      : [];
    const ride = rides.find((a) => a.paired_event_id === eventId);

    return ride ? { session: this.session(event, ride) } : unridden(event);
  }

  /** A session whose ride-side reads are each fetched once, on first ask. */
  private session(
    event: IntervalsEvent,
    activity: Activity,
    detailed?: Activity
  ): PairedSession {
    const api = this.deps.activitiesApi;
    let detail: Promise<Activity> | undefined = detailed
      ? Promise.resolve(detailed)
      : undefined;
    let record: ReturnType<PairedSession["executionRecord"]> | undefined;
    let streams: ReturnType<PairedSession["streams"]> | undefined;

    const session: PairedSession = {
      event,
      activity,
      // The list payload omits icu_intervals; the full activity carries them.
      detail: () => (detail ??= api.getActivity(activity.id, true)),
      executionRecord: () =>
        (record ??= Promise.all([
          session.detail(),
          api.getActivityLaps(activity.id),
        ]).then(([full, laps]) => executionCandidates(full, laps))),
      streams: () =>
        (streams ??= api.getActivityStreams(activity.id, ["watts", "time"])),
    };
    return session;
  }
}

function unpaired(activity: Activity): Unpaired {
  return {
    activity,
    reason: "no-paired-event",
    message:
      `Activity ${activity.id} is not paired to a planned workout, so there ` +
      "is no prescription to compare it against.",
  };
}

function unridden(event: IntervalsEvent): Unpaired {
  const day = (event.start_date_local ?? "").slice(0, 10);
  return {
    event,
    reason: "no-paired-activity",
    message:
      `No completed activity is paired to event ${event.id} within ` +
      `${PAIR_SEARCH_WINDOW_DAYS} days of ${day || "its date"} — the session ` +
      "was not executed, or has not been uploaded yet.",
  };
}

function unriddenId(eventId: number): Unpaired {
  return {
    reason: "no-paired-activity",
    message: `Event ${eventId} is not in the window, so no ride was paired to it.`,
  };
}

export function createPairedSessionLoader(
  deps: PairedSessionDeps
): PairedSessionLoader {
  return new PairedSessionLoader(deps);
}
