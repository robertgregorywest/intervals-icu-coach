/**
 * Power-stream arithmetic shared by more than one module: normalised power and
 * the best mean over a window. Pure, over 1 Hz streams.
 */

/**
 * Rolling-mean window for normalised power: 30 seconds, trailing and
 * expanding. The first 29 samples each average what has arrived so far
 * rather than being skipped — skipping them leaves a session under 30
 * seconds with nothing to average at all, and costs exact matches against
 * the platform even on longer ones (see training-load-forecast's
 * corpus-fidelity tests).
 */
export const ROLLING_WINDOW_SECONDS = 30;

/** Normalised power over a 1 Hz stream. Unrounded — round at the boundary. */
export function normalizedPower(stream: number[]): number | undefined {
  if (stream.length === 0) return undefined;

  const window: number[] = [];
  let sum = 0;
  let fourthPowerSum = 0;

  for (const w of stream) {
    window.push(w);
    sum += w;
    if (window.length > ROLLING_WINDOW_SECONDS) sum -= window.shift()!;
    const mean = sum / window.length;
    fourthPowerSum += mean ** 4;
  }

  return (fourthPowerSum / stream.length) ** 0.25;
}

export function computeBestPower(
  powerStream: Array<number | null>,
  durationSeconds: number
): { bestPower: number; startIndex: number } | null {
  if (durationSeconds > powerStream.length) {
    return null;
  }

  let windowSum = 0;
  for (let i = 0; i < durationSeconds; i++) {
    windowSum += powerStream[i] ?? 0;
  }

  let bestSum = windowSum;
  let bestStart = 0;

  for (let i = durationSeconds; i < powerStream.length; i++) {
    windowSum +=
      (powerStream[i] ?? 0) - (powerStream[i - durationSeconds] ?? 0);
    if (windowSum > bestSum) {
      bestSum = windowSum;
      bestStart = i - durationSeconds + 1;
    }
  }

  return {
    bestPower: Math.round(bestSum / durationSeconds),
    startIndex: bestStart,
  };
}
