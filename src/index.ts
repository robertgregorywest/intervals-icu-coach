import { createHttpClient } from "./client.js";
import type { FetchFn } from "./client.js";
import { isoToday } from "./clock.js";
import { parseClientConfig } from "./config.js";
import { createEventsApi } from "./services/events/index.js";
import type { IEventsApi } from "./services/events/index.js";
import { createWorkoutScheduling } from "./services/workout-scheduling/index.js";
import type { IWorkoutScheduling } from "./services/workout-scheduling/index.js";
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
import { createTrack } from "./services/track/index.js";
import { createFitCodec } from "./services/fit/index.js";
import type { ITrack } from "./services/track/index.js";
import { createTrainingWeek } from "./services/training-week/index.js";
import type { ITrainingWeek } from "./services/training-week/index.js";
import { createTrainingLoadForecast } from "./services/training-load-forecast/index.js";
import type { ITrainingLoadForecast } from "./services/training-load-forecast/index.js";
import { createCoachingContext } from "./services/coaching-context/index.js";
import type { ICoachingContext } from "./services/coaching-context/index.js";
import { createMap } from "./services/map/index.js";
import { createAthleteAnchors } from "./services/athlete-anchors/index.js";
import type { IAthleteAnchors } from "./services/athlete-anchors/index.js";
import { createPowerProfile } from "./services/power-profile/index.js";
import { createPrescription } from "./services/prescription/index.js";
import type { IPowerProfile } from "./services/power-profile/index.js";

/**
 * The services a Tool handler can reach. Handlers take what they need from
 * here; nothing on it forwards to anything else.
 */
export interface IServices {
  readonly events: IEventsApi;
  /** Every workout write to the calendar, and the update_event structure guard. */
  readonly workoutScheduling: IWorkoutScheduling;
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
  /** Track session records, and the alignment of their splits to a ride. */
  readonly track: ITrack;
  readonly trainingWeek: ITrainingWeek;
  readonly trainingLoadForecast: ITrainingLoadForecast;
  readonly coachingContext: ICoachingContext;
  readonly powerProfile: IPowerProfile;
  /** "Today" as YYYY-MM-DD — pinned by the eval harness. */
  readonly today: () => string;
}

export interface ServicesOptions {
  apiKey?: string;
  athleteId?: string;
  baseUrl?: string;
  /** Replaces the network — the eval harness replays recorded responses. */
  fetchFn?: FetchFn;
  /** "Today" as YYYY-MM-DD; pinned by the eval harness to the scenario date. */
  today?: () => string;
}

/** The composition root: builds every service once, over one HTTP client. */
export function createServices(options: ServicesOptions = {}): IServices {
  const config = parseClientConfig({
    apiKey: options.apiKey ?? process.env.INTERVALS_API_KEY,
    athleteId: options.athleteId ?? process.env.INTERVALS_ATHLETE_ID ?? "0",
    baseUrl: options.baseUrl ?? "https://intervals.icu",
  });
  const { athleteId } = config;
  const today = options.today ?? isoToday;

  const httpClient = createHttpClient(config, options.fetchFn);
  const events = createEventsApi(httpClient, athleteId);
  const athlete = createAthleteApi(httpClient, athleteId);
  const fit = createFitCodec();
  const activities = createActivitiesApi(httpClient, athleteId, { fit });
  const wellness = createWellnessApi(httpClient, athleteId);
  const powerCurves = createPowerCurvesApi(httpClient, athleteId);
  // The one reader of every prescription, so no two lenses disagree on a plan.
  const prescription = createPrescription();
  const workoutLibrary = createWorkoutLibrary(
    createWorkoutLibraryApi(httpClient, athleteId),
    { prescription }
  );
  const analysis = createActivityAnalysis({ activitiesApi: activities });
  // One source for every FTP and MAP-zone reader, so nothing builds the
  // coaching context to get them.
  const anchors = createAthleteAnchors({
    athleteApi: athlete,
    map: createMap({ activitiesApi: activities }),
    powerCurvesApi: powerCurves,
    today,
  });
  const workoutScheduling = createWorkoutScheduling({
    eventsApi: events,
    workoutLibrary,
    anchors,
    prescription,
  });
  const executionReview = createExecutionReview({
    activitiesApi: activities,
    eventsApi: events,
    anchors,
    prescription,
  });
  // The records are tracked files, not Intervals.icu; only aligning a
  // record's splits to a ride reaches the activities API.
  const track = createTrack({ activitiesApi: activities, fit });
  const trainingLoadForecast = createTrainingLoadForecast({
    eventsApi: events,
    wellnessApi: wellness,
    anchors,
    prescription,
  });
  const trainingWeek = createTrainingWeek({
    activitiesApi: activities,
    wellnessApi: wellness,
    eventsApi: events,
    anchors,
    today,
  });
  const coachingContext = createCoachingContext({
    anchors,
    wellnessApi: wellness,
    today,
  });
  const powerProfile = createPowerProfile({
    anchors,
    powerCurvesApi: powerCurves,
    today,
  });

  return {
    events,
    workoutScheduling,
    athlete,
    anchors,
    activities,
    wellness,
    powerCurves,
    workoutLibrary,
    analysis,
    executionReview,
    track,
    trainingWeek,
    trainingLoadForecast,
    coachingContext,
    powerProfile,
    today,
  };
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
export type {
  IWorkoutScheduling,
  EventChanges,
  LibraryPlacement,
  StrengthSession,
  ScheduledWorkouts,
  WorkoutStep,
  RepeatBlock,
  WorkoutPlan,
} from "./services/workout-scheduling/index.js";
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
  PlannedStep,
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
  ITrack,
  TrackInput,
  TrackWriteInput,
  TrackLapAlignmentResult,
  AlignedRun,
  AlignedLap,
  AlignmentConfidence,
  AlignmentThresholds,
  AlignmentVerdict,
  RolloutAgreement,
  Reading,
  TrackRunWriteResult,
  WrittenRun,
  WriteMode,
} from "./services/track/index.js";
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
export type { IMap, MapInfo, MapDerivation } from "./services/map/index.js";
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
export type { IActivityAnalysis } from "./services/analysis/index.js";
export type { ICoachingContext } from "./services/coaching-context/index.js";
export type { IPowerProfile } from "./services/power-profile/index.js";
export type { ITrainingWeek } from "./services/training-week/index.js";
export type { Tool, ToolDef } from "./tools/define.js";
