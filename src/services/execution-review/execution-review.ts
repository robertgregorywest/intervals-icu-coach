import type { IActivitiesApi } from "../activities/index.js";
import type { IEventsApi } from "../events/index.js";
import type { IAthleteAnchors } from "../athlete-anchors/index.js";
import type { IPrescription } from "../prescription/index.js";
import { PairedSessionLoader } from "./paired/loader.js";
import { DEFAULT_TOLERANCE } from "./steps/review.js";
import { reviewPairedSession, unpairedReview } from "./steps/lens.js";
import {
  distributeSession,
  distributeWindow,
  distributionFrame,
  unpairedDistribution,
} from "./bands/lens.js";
import { digestWindow } from "./digest/digest.js";
import type { PlannedVsActualResult } from "./steps/types.js";
import type {
  IntensityDistributionRangeResult,
  IntensityDistributionResult,
} from "./bands/types.js";
import type { ExecutionDigestResult } from "./digest/types.js";
import type {
  ComparePlannedVsActualOptions,
  IExecutionReview,
  SessionRef,
  WindowRef,
} from "./types.js";

export interface ExecutionReviewDeps {
  activitiesApi: IActivitiesApi;
  eventsApi: IEventsApi;
  /**
   * FTP and the MAP zones — the frame every lens judges against. A test pins
   * them with a fake through these deps: the athlete's MAP moves, and a test
   * whose expected seconds move with it is testing nothing.
   */
  anchors: IAthleteAnchors;
  /** Reads every plan the lenses judge, so they cannot disagree about it. */
  prescription: IPrescription;
}

export class ExecutionReview implements IExecutionReview {
  private loader: PairedSessionLoader;

  constructor(private deps: ExecutionReviewDeps) {
    this.loader = new PairedSessionLoader(deps);
  }

  async comparePlannedVsActual(
    options: ComparePlannedVsActualOptions
  ): Promise<PlannedVsActualResult> {
    const { tolerance = DEFAULT_TOLERANCE, ...ref } = options;
    const found = await this.loader.find(ref);
    return found.session
      ? reviewPairedSession(found.session, {
          tolerance,
          anchors: this.deps.anchors.snapshot(),
          prescription: this.deps.prescription,
        })
      : unpairedReview(found, tolerance);
  }

  async compareIntensityDistribution(
    options: SessionRef
  ): Promise<IntensityDistributionResult> {
    const found = await this.loader.find(options);
    if (!found.session) return unpairedDistribution(found);

    const frame = await distributionFrame(
      this.deps.anchors.snapshot(),
      this.deps.prescription
    );
    return distributeSession(found.session, frame);
  }

  async compareIntensityDistributionRange(
    options: WindowRef
  ): Promise<IntensityDistributionRangeResult> {
    const loaded = await this.loader.loadWindow(options);
    const frame = await distributionFrame(
      this.deps.anchors.snapshot(),
      this.deps.prescription
    );
    return distributeWindow(loaded, frame);
  }

  async getExecutionDigest(options: WindowRef): Promise<ExecutionDigestResult> {
    const loaded = await this.loader.loadWindow(options);
    // One snapshot for the call: the athlete is read at most once however
    // many plans fall back on its FTP, and both lenses share its frame.
    const anchors = this.deps.anchors.snapshot();
    const { prescription } = this.deps;
    return digestWindow(loaded, anchors, prescription, async () =>
      distributeWindow(loaded, await distributionFrame(anchors, prescription))
    );
  }
}

export function createExecutionReview(
  deps: ExecutionReviewDeps
): ExecutionReview {
  return new ExecutionReview(deps);
}
