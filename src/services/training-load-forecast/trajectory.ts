/**
 * The fitness/fatigue model Intervals.icu carries its own chart forward under.
 *
 * `x' = x + (load − x) · (1 − e^(−1/τ))`, applied once per day to each of
 * fitness and fatigue. Checked against 112 consecutive delivered wellness
 * records on the live account, the recursion reproduced every one to within
 * 1e-5 — the residual is the float32 the API serialises, not the model.
 */

/** Intervals.icu's defaults, applied when the athlete has set no constants. */
import { shiftDate } from "../../dates.js";

export { shiftDate };

export const DEFAULT_CTL_DAYS = 42;
export const DEFAULT_ATL_DAYS = 7;

/** Ramp is measured over a week, so a week of history precedes the window. */
export const RAMP_LOOKBACK_DAYS = 7;

export interface TimeConstants {
  ctlDays: number;
  atlDays: number;
}

export interface FitnessState {
  ctl: number;
  atl: number;
}

/** One day carried forward. */
export function advance(
  state: FitnessState,
  load: number,
  constants: TimeConstants
): FitnessState {
  return {
    ctl: state.ctl + (load - state.ctl) * decay(constants.ctlDays),
    atl: state.atl + (load - state.atl) * decay(constants.atlDays),
  };
}

function decay(days: number): number {
  return 1 - Math.exp(-1 / days);
}

/**
 * Form, as `get_coaching_context` already defines it for the live snapshot:
 * same-day fitness minus same-day fatigue.
 *
 * Intervals.icu's own chart conventionally reads form from the previous day.
 * Adopting that here would put two definitions of form in one server, which is
 * worse than differing from the chart by a day in a way the basis states.
 */
export function form(state: FitnessState): number {
  return state.ctl - state.atl;
}

export interface TrajectoryDay {
  date: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  /** Fitness change against seven days earlier; absent until that day exists. */
  ramp?: number;
}

/**
 * Carry a seed state forward across `loads`, in date order.
 *
 * `history` is the delivered fitness behind the first forecast day, newest
 * last. It is not re-simulated — it is what actually happened — but it is what
 * makes ramp defined on day one of the window instead of on day eight.
 */
export function project(
  seed: FitnessState,
  loads: Array<{ date: string; load: number }>,
  constants: TimeConstants,
  history: Array<{ date: string; ctl: number }> = []
): TrajectoryDay[] {
  const ctlByDate = new Map(history.map((h) => [h.date, h.ctl]));
  const days: TrajectoryDay[] = [];
  let state = seed;

  for (const { date, load } of loads) {
    state = advance(state, load, constants);
    ctlByDate.set(date, state.ctl);
    const earlier = ctlByDate.get(shiftDate(date, -RAMP_LOOKBACK_DAYS));
    days.push({
      date,
      load,
      ctl: state.ctl,
      atl: state.atl,
      tsb: form(state),
      ...(earlier !== undefined ? { ramp: state.ctl - earlier } : {}),
    });
  }

  return days;
}

/** Every date from `oldest` to `newest` inclusive. */
export function dateRange(oldest: string, newest: string): string[] {
  const out: string[] = [];
  for (let d = oldest; d <= newest; d = shiftDate(d, 1)) out.push(d);
  return out;
}
