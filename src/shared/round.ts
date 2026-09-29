/**
 * Round at the boundary, to what the measurement supports.
 *
 * Not cosmetic. Summing or differencing values that carry a fixed number of
 * decimals leaves float noise — seven two-decimal lap times sum to
 * `112.21000000000001` — and a reader then has to decide, every time, whether
 * the trailing digits mean anything. They never do: no derived value is
 * meaningful past the precision of its inputs. So round where a value leaves
 * the module, to the decimals its source supports.
 */

export function round(value: number, dp: number): number;
export function round(
  value: number | undefined,
  dp: number
): number | undefined;
export function round(
  value: number | undefined,
  dp: number
): number | undefined {
  if (value === undefined) return undefined;
  const f = 10 ** dp;
  // `+ Number.EPSILON * value` nudges a value already sitting a float-ulp below
  // its own two-decimal representation back onto it, so 16.869999999 rounds to
  // 16.87 rather than 16.86.
  return Math.round((value + Number.EPSILON * Math.abs(value)) * f) / f;
}
