import { createHttpClient } from "./client.js";
import type { FetchFn, IHttpClient } from "./client.js";
import { isoToday } from "./clock.js";
import { parseClientConfig } from "./config.js";
import { createEventsApi } from "./services/events/index.js";
import type { IEventsApi } from "./services/events/index.js";
import { createWorkoutBuilder } from "./services/workout-builder/index.js";
import type {
  IWorkoutBuilder,
  WorkoutPlan,
  WorkoutStep,
  RepeatBlock,
} from "./services/workout-builder/index.js";
import { createAthleteApi } from "./services/athlete/index.js";
import type { IAthleteApi, AthleteProfile } from "./services/athlete/index.js";
import { createActivitiesApi } from "./services/activities/index.js";
import type { IActivitiesApi } from "./services/activities/index.js";
import type {
  Activity,
  ActivityStreams,
  FitLap,
} from "./services/activities/index.js";
import { createWellnessApi } from "./services/wellness/index.js";
import type { IWellnessApi } from "./services/wellness/index.js";
import type { WellnessRecord } from "./services/wellness/index.js";
import { createPowerCurvesApi } from "./services/power-curves/index.js";
import type {
  IPowerCurvesApi,
  PowerCurveOptions,
} from "./services/power-curves/index.js";
import type { PowerCurvePoint } from "./services/power-curves/index.js";
import {
  createWorkoutLibraryApi,
  createWorkoutLibrary,
} from "./services/workout-library/index.js";
import type {
  IWorkoutLibrary,
  LibraryListing,
  LibraryItem,
  SyncOptions,
  SyncReport,
} from "./services/workout-library/index.js";
import { computeAerobicDecoupling } from "./services/analysis/index.js";
import type { DecouplingResult } from "./services/analysis/index.js";
import { compareIntervals as compareIntervalsAnalysis } from "./services/analysis/index.js";
import type {
  CompareIntervalsResult,
  IntervalFilterOptions,
} from "./services/analysis/index.js";
import { createSessionReview } from "./services/session-review/index.js";
import { createExecutionDigest } from "./services/execution-digest/index.js";
import type {
  IExecutionDigest,
  ExecutionDigestResult,
  GetExecutionDigestOptions,
} from "./services/execution-digest/index.js";
import { createIntensityDistribution } from "./services/intensity-distribution/index.js";
import type {
  IIntensityDistribution,
  CompareIntensityDistributionOptions,
  CompareIntensityDistributionRangeOptions,
  IntensityDistributionResult,
  IntensityDistributionRangeResult,
} from "./services/intensity-distribution/index.js";
import type {
  ISessionReview,
  ComparePlannedVsActualOptions,
  PlannedVsActualResult,
} from "./services/session-review/index.js";
import { createTrackLapAlignment } from "./services/track-lap-alignment/index.js";
import type {
  ITrackLapAlignment,
  TrackLapPowerOptions,
  TrackLapAlignmentResult,
} from "./services/track-lap-alignment/index.js";
import { createTrackLapWriteback } from "./services/track-lap-writeback/index.js";
import type {
  ITrackLapWriteback,
  TrackRunWriteOptions,
  TrackRunWriteResult,
} from "./services/track-lap-writeback/index.js";
import { createTrackSessions } from "./services/track-sessions/index.js";
import type {
  ITrackSessions,
  CompareTrackSessionsOptions,
  GetTrackSessionOptions,
  ListTrackSessionsResult,
  RunComparison,
  TrackSessionDetail,
  TrackSplitsSource,
} from "./services/track-sessions/index.js";
import { createTrainingWeek } from "./services/training-week/index.js";
import type {
  ITrainingWeek,
  TrainingWeekSummary,
} from "./services/training-week/index.js";
import { createTrainingLoadForecast } from "./services/training-load-forecast/index.js";
import type {
  ForecastOptions,
  ForecastResult,
  ITrainingLoadForecast,
} from "./services/training-load-forecast/index.js";
import { buildCoachingContext } from "./services/coaching-context/index.js";
import { createAthleteAnchors } from "./services/athlete-anchors/index.js";
import type {
  AthleteAnchors,
  IAthleteAnchors,
} from "./services/athlete-anchors/index.js";
import type {
  CoachingContext,
  CoachingContextOptions,
} from "./services/coaching-context/index.js";
import { computePowerProfileWith } from "./services/power-profile/index.js";
import type {
  PowerProfileOverrides,
  PowerProfileResult,
} from "./services/power-profile/index.js";
import type { IntervalsEvent } from "./types.js";

export interface IIntervalsClient {
  // Events
  getEvents(oldest: string, newest: string): Promise<IntervalsEvent[]>;
  getEvent(eventId: number): Promise<IntervalsEvent>;
  createEvents(events: IntervalsEvent[]): Promise<IntervalsEvent[]>;
  updateEvent(
    eventId: number,
    data: Partial<IntervalsEvent>
  ): Promise<IntervalsEvent>;
  deleteEvents(
    ids: Array<{ external_id?: string; id?: number }>
  ): Promise<void>;

  // Athlete
  getAthlete(): Promise<AthleteProfile>;
  /** FTP, weight and power zones — one athlete request, no coaching context. */
  getAthleteAnchors(): Promise<AthleteAnchors>;

  // Activities
  getActivities(oldest: string, newest: string): Promise<Activity[]>;
  getActivity(id: string, includeIntervals?: boolean): Promise<Activity>;
  getActivityStreams(id: string, types?: string[]): Promise<ActivityStreams>;
  getActivityLaps(id: string): Promise<FitLap[] | null>;

  // Wellness
  getWellness(oldest: string, newest: string): Promise<WellnessRecord[]>;
  getFitnessSummary(): Promise<WellnessRecord>;

  // Power curves
  getPowerCurve(options?: PowerCurveOptions): Promise<PowerCurvePoint[]>;

  // Workouts
  buildWorkoutEvent(plan: WorkoutPlan): IntervalsEvent;
  buildWorkoutDescription(
    steps: Array<WorkoutStep | RepeatBlock>,
    notes?: string
  ): string;

  // Workout library
  listWorkoutLibrary(folderName?: string): Promise<LibraryListing>;
  getWorkoutLibraryItem(workoutId: number): Promise<LibraryItem>;
  syncWorkoutLibrary(opts?: SyncOptions): Promise<SyncReport>;
  deleteWorkoutLibraryItem(workoutId: number): Promise<void>;

  // Analysis
  getAerobicDecoupling(activityId: string): Promise<DecouplingResult>;
  compareIntervals(
    activityIds: string[],
    options?: IntervalFilterOptions
  ): Promise<CompareIntervalsResult>;

  // Session review
  comparePlannedVsActual(
    options: ComparePlannedVsActualOptions
  ): Promise<PlannedVsActualResult>;
  compareIntensityDistribution(
    options: CompareIntensityDistributionOptions
  ): Promise<IntensityDistributionResult>;
  compareIntensityDistributionRange(
    options: CompareIntensityDistributionRangeOptions
  ): Promise<IntensityDistributionRangeResult>;
  getExecutionDigest(
    options: GetExecutionDigestOptions
  ): Promise<ExecutionDigestResult>;

  // Track lap alignment
  computeTrackLapPower(
    options: TrackLapPowerOptions
  ): Promise<TrackLapAlignmentResult>;
  writeTrackRuns(options: TrackRunWriteOptions): Promise<TrackRunWriteResult>;

  // Track session records
  listTrackSessions(): Promise<ListTrackSessionsResult>;
  getTrackSession(options: GetTrackSessionOptions): Promise<TrackSessionDetail>;
  compareTrackSessions(
    options: CompareTrackSessionsOptions
  ): Promise<RunComparison>;
  /**
   * Synchronous, alone among these: it reads local files, and its callers are
   * the two track tools assembling their own arguments, not returning a result.
   */
  resolveTrackSplits(sessionId: string): TrackSplitsSource;

  // Training week
  getTrainingWeekSummary(weekStart?: string): Promise<TrainingWeekSummary>;

  // Coaching context
  getCoachingContext(opts?: CoachingContextOptions): Promise<CoachingContext>;

  // Training load forecast
  forecastTrainingLoad(options: ForecastOptions): Promise<ForecastResult>;

  // Power profile
  computePowerProfile(
    overrides?: PowerProfileOverrides
  ): Promise<PowerProfileResult>;
}

export interface IntervalsClientOptions {
  apiKey?: string;
  athleteId?: string;
  baseUrl?: string;
  /** Replaces the network — the eval harness replays recorded responses. */
  fetchFn?: FetchFn;
  /** "Today" as YYYY-MM-DD; pinned by the eval harness to the scenario date. */
  today?: () => string;
}

export class IntervalsClient implements IIntervalsClient {
  private httpClient: IHttpClient;
  private events: IEventsApi;
  private workoutBuilder: IWorkoutBuilder;
  private athlete: IAthleteApi;
  private anchors: IAthleteAnchors;
  private activities: IActivitiesApi;
  private wellness: IWellnessApi;
  private powerCurves: IPowerCurvesApi;
  private workoutLibrary: IWorkoutLibrary;
  private sessionReview: ISessionReview;
  private intensityDistribution: IIntensityDistribution;
  private executionDigest: IExecutionDigest;
  private trackLapAlignment: ITrackLapAlignment;
  private trackLapWriteback: ITrackLapWriteback;
  private trackSessions: ITrackSessions;
  private trainingLoadForecast: ITrainingLoadForecast;
  private trainingWeek: ITrainingWeek;
  private today: () => string;

  constructor(options: IntervalsClientOptions = {}) {
    const config = parseClientConfig({
      apiKey: options.apiKey ?? process.env.INTERVALS_API_KEY,
      athleteId: options.athleteId ?? process.env.INTERVALS_ATHLETE_ID ?? "0",
      baseUrl: options.baseUrl ?? "https://intervals.icu",
    });
    const { athleteId } = config;
    this.today = options.today ?? isoToday;

    this.httpClient = createHttpClient(config, options.fetchFn);
    this.events = createEventsApi(this.httpClient, athleteId);
    this.workoutBuilder = createWorkoutBuilder();
    this.athlete = createAthleteApi(this.httpClient, athleteId);
    this.activities = createActivitiesApi(this.httpClient, athleteId);
    this.wellness = createWellnessApi(this.httpClient, athleteId);
    this.powerCurves = createPowerCurvesApi(this.httpClient, athleteId);
    this.workoutLibrary = createWorkoutLibrary(
      createWorkoutLibraryApi(this.httpClient, athleteId)
    );
    // One source for every FTP and MAP-zone reader, so the lenses and the week
    // summary judge against the same anchors without building the coaching
    // context to get them.
    this.anchors = createAthleteAnchors({
      athleteApi: this.athlete,
      activitiesApi: this.activities,
      powerCurvesApi: this.powerCurves,
      today: this.today,
    });
    const getFtp = async () => (await this.anchors.getAthleteAnchors()).ftp;
    this.sessionReview = createSessionReview({
      activitiesApi: this.activities,
      eventsApi: this.events,
      getFtp,
    });
    const getCoachingZones = async () => {
      const [{ mapZones }, ftp] = await Promise.all([
        this.anchors.getMapAnchors(),
        getFtp(),
      ]);
      return { zones: mapZones, ftp };
    };
    this.intensityDistribution = createIntensityDistribution({
      activitiesApi: this.activities,
      eventsApi: this.events,
      getCoachingZones,
    });
    this.executionDigest = createExecutionDigest({
      eventsApi: this.events,
      activitiesApi: this.activities,
      getFtp,
      getCoachingZones,
    });
    this.trackLapAlignment = createTrackLapAlignment({
      activitiesApi: this.activities,
    });
    this.trackLapWriteback = createTrackLapWriteback({
      activitiesApi: this.activities,
      alignment: this.trackLapAlignment,
    });
    // Reads tracked record files, not Intervals.icu — the only service here
    // that takes no HTTP client and needs no API key.
    this.trackSessions = createTrackSessions();
    this.trainingLoadForecast = createTrainingLoadForecast({
      eventsApi: this.events,
      wellnessApi: this.wellness,
      athleteApi: this.athlete,
    });
    this.trainingWeek = createTrainingWeek({
      activitiesApi: this.activities,
      wellnessApi: this.wellness,
      eventsApi: this.events,
      // Same FTP source as the distribution frame, so the band means the same thing.
      getFtp,
      today: this.today,
    });
  }

  // Events
  async getEvents(oldest: string, newest: string): Promise<IntervalsEvent[]> {
    return this.events.getEvents(oldest, newest);
  }

  async getEvent(eventId: number): Promise<IntervalsEvent> {
    return this.events.getEvent(eventId);
  }

  async createEvents(events: IntervalsEvent[]): Promise<IntervalsEvent[]> {
    return this.events.createEvents(events);
  }

  async updateEvent(
    eventId: number,
    data: Partial<IntervalsEvent>
  ): Promise<IntervalsEvent> {
    return this.events.updateEvent(eventId, data);
  }

  async deleteEvents(
    ids: Array<{ external_id?: string; id?: number }>
  ): Promise<void> {
    return this.events.deleteEvents(ids);
  }

  // Athlete
  async getAthlete(): Promise<AthleteProfile> {
    return this.athlete.getAthlete();
  }

  async getAthleteAnchors(): Promise<AthleteAnchors> {
    return this.anchors.getAthleteAnchors();
  }

  // Activities
  async getActivities(oldest: string, newest: string): Promise<Activity[]> {
    return this.activities.getActivities(oldest, newest);
  }

  async getActivity(id: string, includeIntervals?: boolean): Promise<Activity> {
    return this.activities.getActivity(id, includeIntervals);
  }

  async getActivityStreams(
    id: string,
    types?: string[]
  ): Promise<ActivityStreams> {
    return this.activities.getActivityStreams(id, types);
  }

  async getActivityLaps(id: string): Promise<FitLap[] | null> {
    return this.activities.getActivityLaps(id);
  }

  // Wellness
  async getWellness(oldest: string, newest: string): Promise<WellnessRecord[]> {
    return this.wellness.getWellness(oldest, newest);
  }

  async getFitnessSummary(): Promise<WellnessRecord> {
    return this.wellness.getWellnessDay(this.today());
  }

  // Power curves
  async getPowerCurve(options?: PowerCurveOptions): Promise<PowerCurvePoint[]> {
    return this.powerCurves.getPowerCurve(options);
  }

  // Workouts
  buildWorkoutEvent(plan: WorkoutPlan): IntervalsEvent {
    return this.workoutBuilder.buildEvent(plan);
  }

  buildWorkoutDescription(
    steps: Array<WorkoutStep | RepeatBlock>,
    notes?: string
  ): string {
    return this.workoutBuilder.toDescription(steps, notes);
  }

  // Workout library
  async listWorkoutLibrary(folderName?: string): Promise<LibraryListing> {
    return this.workoutLibrary.list(folderName);
  }

  async getWorkoutLibraryItem(workoutId: number): Promise<LibraryItem> {
    return this.workoutLibrary.get(workoutId);
  }

  async syncWorkoutLibrary(opts?: SyncOptions): Promise<SyncReport> {
    return this.workoutLibrary.sync(opts);
  }

  async deleteWorkoutLibraryItem(workoutId: number): Promise<void> {
    await this.workoutLibrary.delete(workoutId);
  }

  // Analysis
  async getAerobicDecoupling(activityId: string): Promise<DecouplingResult> {
    const streams = await this.activities.getActivityStreams(activityId, [
      "watts",
      "heartrate",
    ]);
    if (!streams.watts?.length) {
      throw new Error("No power data available for this activity");
    }
    if (!streams.heartrate?.length) {
      throw new Error("No heart rate data available for this activity");
    }
    return computeAerobicDecoupling(streams.watts, streams.heartrate);
  }

  async compareIntervals(
    activityIds: string[],
    options?: IntervalFilterOptions
  ): Promise<CompareIntervalsResult> {
    const activities = await Promise.all(
      activityIds.map((id) => this.activities.getActivity(id, true))
    );
    return compareIntervalsAnalysis(activities, options);
  }

  // Session review
  async comparePlannedVsActual(
    options: ComparePlannedVsActualOptions
  ): Promise<PlannedVsActualResult> {
    return this.sessionReview.comparePlannedVsActual(options);
  }

  // Intensity distribution
  async compareIntensityDistribution(
    options: CompareIntensityDistributionOptions
  ): Promise<IntensityDistributionResult> {
    return this.intensityDistribution.compareIntensityDistribution(options);
  }

  async compareIntensityDistributionRange(
    options: CompareIntensityDistributionRangeOptions
  ): Promise<IntensityDistributionRangeResult> {
    return this.intensityDistribution.compareIntensityDistributionRange(
      options
    );
  }

  // Execution digest
  async getExecutionDigest(
    options: GetExecutionDigestOptions
  ): Promise<ExecutionDigestResult> {
    return this.executionDigest.getExecutionDigest(options);
  }

  // Track lap alignment
  async computeTrackLapPower(
    options: TrackLapPowerOptions
  ): Promise<TrackLapAlignmentResult> {
    return this.trackLapAlignment.computeTrackLapPower(options);
  }

  async writeTrackRuns(
    options: TrackRunWriteOptions
  ): Promise<TrackRunWriteResult> {
    return this.trackLapWriteback.writeTrackRuns(options);
  }

  // Track session records
  async listTrackSessions(): Promise<ListTrackSessionsResult> {
    return this.trackSessions.listTrackSessions();
  }

  async getTrackSession(
    options: GetTrackSessionOptions
  ): Promise<TrackSessionDetail> {
    return this.trackSessions.getTrackSession(options);
  }

  async compareTrackSessions(
    options: CompareTrackSessionsOptions
  ): Promise<RunComparison> {
    return this.trackSessions.compareTrackSessions(options);
  }

  resolveTrackSplits(sessionId: string): TrackSplitsSource {
    return this.trackSessions.resolveTrackSplits(sessionId);
  }

  // Training week
  async getTrainingWeekSummary(
    weekStart?: string
  ): Promise<TrainingWeekSummary> {
    return this.trainingWeek.getTrainingWeekSummary(weekStart);
  }

  // Coaching context
  async getCoachingContext(
    opts?: CoachingContextOptions
  ): Promise<CoachingContext> {
    return buildCoachingContext(
      {
        athleteApi: this.athlete,
        wellnessApi: this.wellness,
        activitiesApi: this.activities,
        powerCurvesApi: this.powerCurves,
      },
      { ...opts, today: opts?.today ?? this.today() }
    );
  }

  // Training load forecast
  async forecastTrainingLoad(
    options: ForecastOptions
  ): Promise<ForecastResult> {
    return this.trainingLoadForecast.forecastTrainingLoad(options);
  }

  // Power profile (cyclecoach.com calculator port)
  async computePowerProfile(
    overrides?: PowerProfileOverrides
  ): Promise<PowerProfileResult> {
    return computePowerProfileWith(
      {
        athleteApi: this.athlete,
        activitiesApi: this.activities,
        powerCurvesApi: this.powerCurves,
      },
      overrides,
      { today: this.today() }
    );
  }
}

export function createClient(
  options?: IntervalsClientOptions
): IntervalsClient {
  return new IntervalsClient(options);
}

// Re-export types
export type {
  IntervalsEvent,
  EventCategory,
  SportType,
  ClientConfig,
} from "./types.js";
export type { IHttpClient } from "./client.js";
export { HttpError } from "./client.js";
export type { IEventsApi } from "./services/events/index.js";
export type { IWorkoutBuilder } from "./services/workout-builder/index.js";
export type {
  WorkoutStep,
  RepeatBlock,
  WorkoutPlan,
} from "./services/workout-builder/index.js";
export type {
  IAthleteApi,
  AthleteProfile,
  SportSetting,
} from "./services/athlete/index.js";
export type { IActivitiesApi } from "./services/activities/index.js";
export type {
  Activity,
  ActivityInterval,
  ActivityStreams,
} from "./services/activities/index.js";
export type { IWellnessApi } from "./services/wellness/index.js";
export type { WellnessRecord } from "./services/wellness/index.js";
export type {
  IPowerCurvesApi,
  PowerCurveOptions,
} from "./services/power-curves/index.js";
export type { PowerCurvePoint } from "./services/power-curves/index.js";
export type {
  DecouplingResult,
  DecouplingHalf,
} from "./services/analysis/index.js";
export type {
  CompareIntervalsResult,
  IntervalFilterOptions,
} from "./services/analysis/index.js";
export type {
  ISessionReview,
  ComparePlannedVsActualOptions,
  PlannedVsActualResult,
  AlignedStep,
  AlignmentBasis,
  StepVerdict,
  ReviewReason,
  SessionRollup,
  UnplannedInterval,
  FlatPlannedStep,
  DeliveredInterval,
  PowerTarget,
} from "./services/session-review/index.js";
export type {
  IExecutionDigest,
  ExecutionDigestResult,
  GetExecutionDigestOptions,
  DigestSession,
  FlaggedStep,
} from "./services/execution-digest/index.js";
export type {
  IIntensityDistribution,
  CompareIntensityDistributionOptions,
  CompareIntensityDistributionRangeOptions,
  IntensityDistributionResult,
  IntensityDistributionRangeResult,
  DistributionReason,
  PartitionBand,
  ZoneComparisonRow,
  MiddleBandRollup,
  UnbucketedStep,
  BoundarySpanningStep,
  RangeSessionRow,
  ExcludedSession,
} from "./services/intensity-distribution/index.js";
export type {
  ITrackLapAlignment,
  TrackLapPowerOptions,
  TrackLapAlignmentResult,
  AlignedRun,
  AlignedLap,
  AlignmentConfidence,
  AlignmentThresholds,
  AlignmentVerdict,
  RolloutAgreement,
  Reading,
  RunSplits,
  LapSplit,
  CandidateWindow,
} from "./services/track-lap-alignment/index.js";
export type {
  ITrackLapWriteback,
  TrackRunWriteOptions,
  TrackRunWriteResult,
  WrittenRun,
  WriteMode,
} from "./services/track-lap-writeback/index.js";
export type {
  ITrainingLoadForecast,
  ForecastOptions,
  ForecastResult,
  ForecastBasis,
  ForecastSession,
  ForecastWeek,
  ProposedSession,
  LoadSource,
  TrajectoryDay,
  StreamGap,
} from "./services/training-load-forecast/index.js";
export type {
  CoachingContext,
  CoachingContextOptions,
  AthleteSnapshot,
  FitnessSnapshot,
  WellnessTrendPoint,
} from "./services/coaching-context/index.js";
export type { MapInfo, MapDerivation } from "./services/map/index.js";
export type {
  AthleteAnchors,
  IAthleteAnchors,
  MapAnchors,
} from "./services/athlete-anchors/index.js";
export type {
  PowerProfileOverrides,
  PowerProfileResult,
  ResolvedInputs,
  Sex,
  AeroPosition,
  Discipline,
  TrainingHistory,
  StrengthFrequency,
  ZoneRow,
  FtpCheck,
  PstsResult,
  CompoundResult,
  Vo2Result,
  AllometricResult,
  TpProfileRow,
  RiderTypeResult,
  MapBandResult,
  TtEstimateRow,
  RaceEstimateRow,
} from "./services/power-profile/index.js";
export type {
  IWorkoutLibrary,
  LibraryListing,
  LibraryItem,
  LibraryFolder,
  LibraryWorkout,
  LibraryWorkoutSummary,
  LibraryWorkoutInput,
  WorkoutSummary,
  AnchorBasis,
} from "./services/workout-library/index.js";
