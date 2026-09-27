import type { PlannedCadence, PlannedPower } from "../../types.js";

/**
 * The token vocabulary of a step line, as the compose-workout skill's syntax
 * cheatsheet documents it and as the platform's own parse was measured to read it.
 *
 * A step line is a sequence of whitespace-separated tokens. Leading tokens that
 * match nothing become the step's label; the first token that matches anything
 * ends the label. That is the platform's behaviour, and it is why the workout
 * builder refuses `number+unit` tokens inside a label — `Ramp — MAP = best
 * 60s` would silently become a 60-second step.
 */
export type Token =
  | { kind: "duration"; seconds: number }
  | { kind: "distance"; metres: number }
  | { kind: "ramp" }
  | { kind: "power"; power: PlannedPower }
  | { kind: "cadence"; cadence: PlannedCadence }
  | { kind: "powerTarget"; target: string }
  | { kind: "unknown" };

// `m` is minutes and `mtr` is metres, so the minutes group must not swallow the
// `m` of `mtr`.
const DURATION = /^(?:(\d+)h)?(?:(\d+)m(?!tr\b))?(?:(\d+)s)?$/i;
const DISTANCE = /^(\d+(?:\.\d+)?)(km|mtr|mi)$/i;
const WATTS_POINT = /^(\d+(?:\.\d+)?)w$/i;
// Ranges are written with a hyphen but authors paste en- and em-dashes too,
// and the platform reads those as ranges rather than as label text.
const DASH = "[-\u2010-\u2015]";
const WATTS_RANGE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)w?${DASH}(\\d+(?:\\.\\d+)?)w$`,
  "i"
);
const PERCENT_POINT = /^(\d+(?:\.\d+)?)%$/;
const PERCENT_RANGE = new RegExp(
  `^(\\d+(?:\\.\\d+)?)${DASH}(\\d+(?:\\.\\d+)?)%$`
);
const ZONE = /^z([1-7])$/i;
const RPM_POINT = /^(\d+)rpm$/i;
const RPM_RANGE = new RegExp(`^(\\d+)${DASH}(\\d+)rpm$`, "i");
/** `power=1s` — the head-unit averaging window Intervals.icu carries through. */
const POWER_TARGET = /^power=(.+)$/i;

/**
 * Where the step's label ends inside `body`, in characters.
 *
 * Measured against the platform, the label runs until the first token that
 * carries a number — and, when that token is not one the grammar recognises,
 * until the digit itself. `Easy spin — 40–55% MAP … 45m 160w-215w` keeps
 * `Easy spin —`, cutting inside the en-dashed range the grammar cannot read;
 * `Ramp 1 1m 200w` keeps `Ramp 1`, because a bare `1` followed by a space is
 * not a number-with-a-unit. The workout builder reads a label through this to
 * refuse one the platform would cut short.
 *
 * `ramp` is deliberately not a label terminator: the platform reads `Ramp to
 * failure 1m 140w` as a step labelled `Ramp to failure`, so the keyword only
 * counts once the label has closed.
 */
export function labelEnd(body: string): { end: number; clearLabel: boolean } {
  const token = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(body)) !== null) {
    const t = classify(m[0]);
    if (t.kind !== "unknown" && t.kind !== "ramp") {
      // A zone reached before the step's duration clears the label rather than
      // ending it: the platform stores `Easy Z2 — optional … 45m 158w-217w`
      // with no label at all, while `Cooldown 10m Z1`, whose zone comes after
      // the duration, keeps `Cooldown`.
      const zone = t.kind === "power" && t.power.units === "power_zone";
      return { end: m.index, clearLabel: zone };
    }
    const trailing = TRAILING_TARGET.exec(m[0]);
    if (trailing) return { end: m.index + trailing.index, clearLabel: false };
  }
  return { end: body.length, clearLabel: false };
}

export function classify(token: string): Token {
  const duration = matchDuration(token);
  if (duration !== undefined) return { kind: "duration", seconds: duration };

  const distance = DISTANCE.exec(token);
  if (distance) {
    const value = Number(distance[1]);
    const unit = distance[2].toLowerCase();
    const metres =
      unit === "km" ? value * 1000 : unit === "mi" ? value * 1609.344 : value;
    return { kind: "distance", metres };
  }

  if (token.toLowerCase() === "ramp") return { kind: "ramp" };

  const power = matchPower(token);
  if (power) return { kind: "power", power };

  const rpmRange = RPM_RANGE.exec(token);
  if (rpmRange) {
    return {
      kind: "cadence",
      cadence: {
        units: "rpm",
        start: Number(rpmRange[1]),
        end: Number(rpmRange[2]),
      },
    };
  }
  const rpm = RPM_POINT.exec(token);
  if (rpm) {
    return {
      kind: "cadence",
      cadence: { units: "rpm", value: Number(rpm[1]) },
    };
  }

  const target = POWER_TARGET.exec(token);
  if (target) return { kind: "powerTarget", target: target[1] };

  return { kind: "unknown" };
}

/** Seconds, or `undefined` when the token is not a duration. */
export function matchDuration(token: string): number | undefined {
  const m = DURATION.exec(token);
  if (!m || (m[1] === undefined && m[2] === undefined && m[3] === undefined)) {
    return undefined;
  }
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

/**
 * A power target in the platform's own storage form: a percentage stays a
 * percentage and a zone stays a zone number. Resolution to watts happens
 * against an anchor at the point of use, never here.
 */
export function matchPower(token: string): PlannedPower | undefined {
  const wattsRange = WATTS_RANGE.exec(token);
  if (wattsRange) {
    return {
      units: "w",
      start: Number(wattsRange[1]),
      end: Number(wattsRange[2]),
    };
  }
  const watts = WATTS_POINT.exec(token);
  if (watts) return { units: "w", value: Number(watts[1]) };

  const pctRange = PERCENT_RANGE.exec(token);
  if (pctRange) {
    return {
      units: "%ftp",
      start: Number(pctRange[1]),
      end: Number(pctRange[2]),
    };
  }
  const pct = PERCENT_POINT.exec(token);
  if (pct) return { units: "%ftp", value: Number(pct[1]) };

  const zone = ZONE.exec(token);
  if (zone) return { units: "power_zone", value: Number(zone[1]) };

  return undefined;
}

/** The repetition count of a repeat-block header line, e.g. `Main Set 3x`. */
export function matchRepeatHeader(line: string): number | undefined {
  const m = /(\d+)\s*x$/i.exec(line.trim());
  if (!m) return undefined;
  const reps = Number(m[1]);
  return reps > 0 ? reps : undefined;
}

/**
 * A token *ending* in a whole number against a unit — `<40%`, `20min` — which
 * the platform reads as a target even though the grammar cannot: the leading
 * punctuation is label text but the number is not.
 *
 * The number must not be part of a decimal, which is what keeps a prose label
 * like `the race suit is worth 0.33s per lap` intact: the platform terminates
 * that label at the step's real `20m`, not at the lap time inside the prose.
 */
const TRAILING_TARGET = /(?<![\d.])\d+(?:%|w|h|s|min|mtr|mi|km|rpm|m)$/i;

/** `Press lap` anywhere on the line, which the platform reads as a lap gate. */
export function hasLapPress(line: string): boolean {
  return /\bpress\s+lap\b/i.test(line);
}
