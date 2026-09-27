import { createHttpClient } from "./client.js";
import type { FetchFn } from "./client.js";
import { isoToday } from "./clock.js";
import { parseClientConfig } from "./config.js";
import { createEventsApi } from "./services/events/index.js";
import type { IEventsApi } from "./services/events/index.js";
import { createEventUpdate } from "./services/event-update/index.js";
import type { IEventUpdate } from "./services/event-update/index.js";
import { createWorkoutBuilder } from "./services/workout-builder/index.js";
import type { IWorkoutBuilder } from "./services/workout-builder/index.js";
import { createAthleteApi } from "./services/athlete/index.js";
import type { IAthleteApi } from "./services/athlete/index.js";
import { createActivitiesApi } from "./services/activities/index.js";
import type { IActivitiesApi } from "./services/activities/index.js";
import { createWellnessApi } from "./services/wellness/index.js";
import type { IWellnessApi } from "./services/wellness/index.js";
import { createPowerCurvesApi } from "./services/power-curves/index.js";
import type { IPowerCurvesApi } from "./services/power-curves/index.js";
import {
  createWorkoutLibraryApi,
  createWorkoutLibrary,
} from "./services/workout-library/index.js";
import type { IWorkoutLibrary } from "./services/workout-library/index.js";
import { createActivityAnalysis } from "./services/analysis/index.js";
import type { IActivityAnalysis } from "./services/analysis/index.js";
import { createExecutionReview } from "./services/execution-review/index.js";
import type { IExecutionReview } from "./services/execution-review/index.js";
import { createTrackLapAlignment } from "./services/track-lap-alignment/index.js";
import type { ITrackLapAlignment } from "./services/track-lap-alignment/index.js";
import { createTrackLapWriteback } from "./services/track-lap-writeback/index.js";
import type { ITrackLapWriteback } from "./services/track-lap-writeback/index.js";
import { createTrackSessions } from "./services/track-sessions/index.js";
import type { ITrackSessions } from "./services/track-sessions/index.js";
import { createTrainingWeek } from "./services/training-week/index.js";
import type { ITrainingWeek } from "./services/training-week/index.js";
import { createTrainingLoadForecast } from "./services/training-load-forecast/index.js";
import type { ITrainingLoadForecast } from "./services/training-load-forecast/index.js";
import { createCoachingContext } from "./services/coaching-context/index.js";
import type { ICoachingContext } from "./services/coaching-context/index.js";
import { createAthleteAnchors } from "./services/athlete-anchors/index.js";
import type { IAthleteAnchors } from "./services/athlete-anchors/index.js";
import { createPowerProfile } from "./services/power-profile/index.js";
import type { IPowerProfile } from "./services/power-profile/index.js";

/**
 * The services a Tool handler can reach. Handlers take what they need from
 * here; nothing on it forwards to anything else.
 */
export interface IIntervalsClient {
  readonly events: IEventsApi;
  readonly eventUpdate: IEventUpdate;
  readonly workoutBuilder: IWorkoutBuilder;
  readonly athlete: IAthleteApi;
  /** FTP, weight, power zones, MAP and MAP zones — the one place they are read. */
  readonly anchors: IAthleteAnchors;
  readonly activities: IActivitiesApi;
  readonly wellness: IWellnessApi;
  readonly powerCurves: IPowerCurvesApi;
  readonly workoutLibrary: IWorkoutLibrary;
  readonly analysis: IActivityAnalysis;
  /** The step lens, the band lens and the execution digest, over paired sessions. */
  readonly executionReview: IExecutionReview;
  readonly trackLapAlignment: ITrackLapAlignment;
  readonly trackLapWriteback: ITrackLapWriteback;
  readonly trackSessions: ITrackSessions;
  readonly trainingWeek: ITrainingWeek;
  readonly trainingLoadForecast: ITrainingLoadForecast;
  readonly coachingContext: ICoachingContext;
  readonly powerProfile: IPowerProfile;
  /** "Today" as YYYY-MM-DD — pinned by the eval harness. */
  readonly today: () => string;
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

/** The composition root: builds every service once, over one HTTP client. */
export class IntervalsClient implements IIntervalsClient {
  readonly events: IEventsApi;
  readonly eventUpdate: IEventUpdate;
  readonly workoutBuilder: IWorkoutBuilder;
  readonly athlete: IAthleteApi;
  readonly anchors: IAthleteAnchors;
  readonly activities: IActivitiesApi;
  readonly wellness: IWellnessApi;
  readonly powerCurves: IPowerCurvesApi;
  readonly workoutLibrary: IWorkoutLibrary;
  readonly analysis: IActivityAnalysis;
  readonly executionReview: IExecutionReview;
  readonly trackLapAlignment: ITrackLapAlignment;
  readonly trackLapWriteback: ITrackLapWriteback;
  readonly trackSessions: ITrackSessions;
  readonly trainingWeek: ITrainingWeek;
  readonly trainingLoadForecast: ITrainingLoadForecast;
  readonly coachingContext: ICoachingContext;
  readonly powerProfile: IPowerProfile;
  readonly today: () => string;

  constructor(options: IntervalsClientOptions = {}) {
    const config = parseClientConfig({
      apiKey: options.apiKey ?? process.env.INTERVALS_API_KEY,
      athleteId: options.athleteId ?? process.env.INTERVALS_ATHLETE_ID ?? "0",
      baseUrl: options.baseUrl ?? "https://intervals.icu",
    });
    const { athleteId } = config;
    this.today = options.today ?? isoToday;

    const httpClient = createHttpClient(config, options.fetchFn);
    this.events = createEventsApi(httpClient, athleteId);
    this.workoutBuilder = createWorkoutBuilder();
    this.eventUpdate = createEventUpdate({
      eventsApi: this.events,
      workoutBuilder: this.workoutBuilder,
    });
    this.athlete = createAthleteApi(httpClient, athleteId);
    this.activities = createActivitiesApi(httpClient, athleteId);
    this.wellness = createWellnessApi(httpClient, athleteId);
    this.powerCurves = createPowerCurvesApi(httpClient, athleteId);
    this.workoutLibrary = createWorkoutLibrary(
      createWorkoutLibraryApi(httpClient, athleteId)
    );
    this.analysis = createActivityAnalysis({ activitiesApi: this.activities });
    // One source for every FTP and MAP-zone reader, so nothing builds the
    // coaching context to get them.
    this.anchors = createAthleteAnchors({
      athleteApi: this.athlete,
      activitiesApi: this.activities,
      powerCurvesApi: this.powerCurves,
      today: this.today,
    });
    this.executionReview = createExecutionReview({
      activitiesApi: this.activities,
      eventsApi: this.events,
      anchors: this.anchors,
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
      anchors: this.anchors,
    });
    this.trainingWeek = createTrainingWeek({
      activitiesApi: this.activities,
      wellnessApi: this.wellness,
      eventsApi: this.events,
      anchors: this.anchors,
      today: this.today,
    });
    this.coachingContext = createCoachingContext({
      anchors: this.anchors,
      wellnessApi: this.wellness,
      today: this.today,
    });
    this.powerProfile = createPowerProfile({
      anchors: this.anchors,
      powerCurvesApi: this.powerCurves,
      today: this.today,
    });
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
  IExecutionReview,
  SessionRef,
  WindowRef,
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
  ExecutionDigestResult,
  DigestSession,
  FlaggedStep,
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
} from "./services/execution-review/index.js";
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
export type {
  IEventUpdate,
  EventChanges,
} from "./services/event-update/index.js";
export type { IActivityAnalysis } from "./services/analysis/index.js";
export type { ICoachingContext } from "./services/coaching-context/index.js";
export type { IPowerProfile } from "./services/power-profile/index.js";
export type {
  ITrackSessions,
  TrackSplitsSource,
} from "./services/track-sessions/index.js";
export type { ITrainingWeek } from "./services/training-week/index.js";
export type { Tool, ToolDef } from "./tools/define.js";
