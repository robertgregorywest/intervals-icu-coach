import type {
  PlannedCadence,
  PlannedDocStep,
  PlannedPower,
  WorkoutDoc,
} from "../../types.js";
import type {
  DiscardedLine,
  DiscardReason,
  IWorkoutParser,
  ParseAnchors,
  ParsedWorkout,
  ResolvedPower,
} from "./types.js";
import {
  classify,
  hasLapPress,
  labelEnd,
  matchRepeatHeader,
} from "./tokens.js";
import { zoneBand } from "./zones.js";

/**
 * Section headers the platform reads as flagging the steps that follow. Scoped
 * to the blank line that closes them, the same way a repeat block is.
 */
const SECTION_HEADERS: Record<string, "warmup" | "cooldown"> = {
  warmup: "warmup",
  "warm up": "warmup",
  "warm-up": "warmup",
  cooldown: "cooldown",
  "cool down": "cooldown",
  "cool-down": "cooldown",
};

/**
 * A horizontal rule: three or more dashes, optionally spaced (`---`, `-----`,
 * `- - -`). Measured against the platform (#37): it is no step and is dropped
 * without a trace, but it closes an open repeat or section block, as a blank
 * line does. `--` and `--- note` are ordinary step lines, dropped for want of
 * a duration, and close nothing.
 */
const RULE = /^-(?:\s*-){2,}$/;

type OpenBlock =
  | { kind: "repeat"; reps: number; text: string; steps: PlannedDocStep[] }
  | { kind: "section"; flag: "warmup" | "cooldown" };

class WorkoutParser implements IWorkoutParser {
  parse(text: string, anchors: ParseAnchors = {}): ParsedWorkout {
    const steps: PlannedDocStep[] = [];
    const discarded: DiscardedLine[] = [];
    const notes: string[] = [];
    let block: OpenBlock | undefined;
    // Index of the first line read as structure; the preamble is what's above.
    let structureStart: number | undefined;

    const closeBlock = (): void => {
      if (block?.kind === "repeat" && block.steps.length > 0) {
        steps.push(repeatBlock(block.reps, block.text, block.steps));
      }
      block = undefined;
    };

    const lines = text.split(/\r?\n/);
    lines.forEach((raw, i) => {
      const line = raw.trim();

      if (line === "" || RULE.test(line)) {
        closeBlock();
        return;
      }

      if (line.startsWith("-")) {
        structureStart ??= i;
        const step = parseStepLine(line);
        if (!step) {
          discarded.push({
            line: i + 1,
            text: line,
            reason: discardReason(line),
            ...(block?.kind === "repeat" ? { reps: block.reps } : {}),
          });
          return;
        }
        if (block?.kind === "repeat") {
          block.steps.push(step);
        } else if (block?.kind === "section") {
          steps.push({ ...step, [block.flag]: true });
        } else {
          steps.push(step);
        }
        return;
      }

      // A non-step line. It either opens a block or is prose.
      const reps = matchRepeatHeader(line);
      if (reps !== undefined) {
        structureStart ??= i;
        closeBlock();
        block = { kind: "repeat", reps, text: line, steps: [] };
        return;
      }

      const section = SECTION_HEADERS[line.toLowerCase()];
      if (section !== undefined) {
        structureStart ??= i;
        closeBlock();
        block = { kind: "section", flag: section };
        return;
      }

      closeBlock();
      notes.push(line);
    });

    closeBlock();

    const doc: WorkoutDoc = {
      steps,
      duration: steps.reduce((sum, s) => sum + (s.duration ?? 0), 0),
      distance: 0,
    };

    return {
      doc,
      basis: {
        source: "local-parse",
        ftp: anchors.ftp ?? null,
        powerZones: anchors.powerZones ?? null,
      },
      discarded,
      notes,
      preamble: lines.slice(0, structureStart).join("\n").trim(),
    };
  }

  resolvePower(
    power: PlannedPower | undefined,
    anchors: ParseAnchors,
    ramp = false
  ): { target?: ResolvedPower; unresolved?: string } {
    return resolvePowerTarget(power, anchors, ramp);
  }

  resolveZones(doc: WorkoutDoc, anchors: ParseAnchors): WorkoutDoc {
    return resolveZoneTargets(doc, anchors);
  }

  labelTerminator(label: string): string | undefined {
    const text = label.trimEnd();
    const { end, clearLabel } = labelEnd(text);
    if (!clearLabel && end >= text.length) return undefined;
    return text.slice(end).split(/\s+/)[0];
  }
}

export function createWorkoutParser(): IWorkoutParser {
  return new WorkoutParser();
}

function repeatBlock(
  reps: number,
  text: string,
  steps: PlannedDocStep[]
): PlannedDocStep {
  const inner = steps.reduce((sum, s) => sum + (s.duration ?? 0), 0);
  return { reps, text, steps, distance: 0, duration: inner * reps };
}

/**
 * One `- ` line. Returns `undefined` for a line the platform would drop.
 *
 * Tokens are read left to right: leading tokens that match nothing accumulate
 * into the label, and the first token that matches anything ends it. A later
 * token of the same kind wins over an earlier one — `Z6 1m 113-138%` keeps the
 * percentage band and drops the zone, which is what the platform stores.
 */
function parseStepLine(line: string): PlannedDocStep | undefined {
  const body = line.replace(/^-\s*/, "");
  const cut = labelEnd(body);
  const label = cut.clearLabel ? "" : body.slice(0, cut.end).trim();
  const tokens = body.slice(cut.end).split(/\s+/).filter(Boolean);

  let duration: number | undefined;
  let distance: number | undefined;
  let ramp = false;
  let power: PlannedPower | undefined;
  let cadence: PlannedCadence | undefined;
  let powerTarget: string | undefined;

  // Last token of a kind wins: `Z6 1m 113-138%` keeps the percentage band and
  // drops the zone, which is what the platform stores.
  for (const token of tokens) {
    const t = classify(token);
    switch (t.kind) {
      case "duration":
        duration = t.seconds;
        break;
      case "distance":
        distance = t.metres;
        break;
      case "ramp":
        ramp = true;
        break;
      case "power":
        power = t.power;
        break;
      case "cadence":
        cadence = t.cadence;
        break;
      case "powerTarget":
        powerTarget = t.target;
        break;
      case "unknown":
        break;
    }
  }

  // The platform drops a step line it cannot give a duration to rather than
  // emitting a zero-duration step. Verified against the live account: a block
  // containing `- MAX standing start from near-stop` and a `- 0s 200w` step
  // came back carrying neither.
  if (duration === undefined || duration <= 0) return undefined;

  if (power && powerTarget !== undefined)
    power = { ...power, target: powerTarget };

  return {
    ...(label.length > 0 ? { text: label } : {}),
    ...(ramp ? { ramp: true } : {}),
    ...(power ? { power } : {}),
    ...(cadence ? { cadence } : {}),
    duration,
    ...(distance !== undefined ? { distance } : {}),
    ...(hasLapPress(line) ? { until_lap_press: true } : {}),
  };
}

function discardReason(line: string): DiscardReason {
  const body = line.replace(/^-\s*/, "");
  const tokens = body.split(/\s+/).filter(Boolean);
  const hasZero = tokens.some((t) => {
    const c = classify(t);
    return c.kind === "duration" && c.seconds === 0;
  });
  if (hasZero) return "zero duration";
  const hasDistance = tokens.some((t) => classify(t).kind === "distance");
  if (hasDistance) return "distance-based step with no duration";
  return "no parseable duration";
}

/**
 * Resolve a stored target to absolute watts against the anchors it names.
 *
 * A band stays a band — collapsing it here would lose the distinction between a
 * deliberately wide endurance target and a point target, which the middle-band
 * dose in `bucket.ts` depends on. An unresolvable target is named, never
 * defaulted: a plausible wrong wattage is worse than a stated gap.
 */
function resolvePowerTarget(
  power: PlannedPower | undefined,
  anchors: ParseAnchors,
  ramp = false
): { target?: ResolvedPower; unresolved?: string } {
  if (!power) return {};

  const units = (power.units ?? "w").toLowerCase();

  if (units === "power_zone") {
    const zone = power.value;
    if (typeof zone !== "number") {
      return { unresolved: "zone target with no zone number" };
    }
    if (!anchors.ftp || anchors.ftp <= 0) {
      return { unresolved: `Z${zone} target but no FTP available` };
    }
    if (!anchors.powerZones?.length) {
      return {
        unresolved: `Z${zone} target but the athlete has no power zones set`,
      };
    }
    const band = zoneBand(zone, anchors.ftp, anchors.powerZones);
    if (!band) {
      return {
        unresolved: `Z${zone} is outside the athlete's ${anchors.powerZones.length} power zones`,
      };
    }
    return { target: { low: band.lowW, high: band.highW } };
  }

  const isWatts = units === "w" || units === "watts";
  // Only a percentage *of FTP*. `%hr` and `%pace` are percentages too, and
  // resolving them against FTP would produce a confident wrong wattage.
  const isPercent = units === "%ftp" || units === "%" || units === "percent";

  let scale = 1;
  if (!isWatts) {
    if (!isPercent) {
      return { unresolved: `unsupported power units "${power.units}"` };
    }
    if (!anchors.ftp || anchors.ftp <= 0) {
      return { unresolved: "percent-of-FTP target but no FTP available" };
    }
    scale = anchors.ftp / 100;
  }

  const conv = (n: number) => n * scale;

  if (typeof power.start === "number" && typeof power.end === "number") {
    if (power.start === power.end)
      return { target: { watts: conv(power.start) } };
    const descending = power.end < power.start;
    return {
      target: {
        low: conv(Math.min(power.start, power.end)),
        high: conv(Math.max(power.start, power.end)),
        ...(ramp ? { ramp: true } : {}),
        ...(ramp && descending ? { rampDescending: true } : {}),
      },
    };
  }

  if (typeof power.value === "number") {
    return { target: { watts: conv(power.value) } };
  }

  return {};
}

/**
 * Rewrite zone targets in a document into the watt bands they resolve to,
 * leaving every other target alone.
 *
 * This is what lets `flattenPlannedSteps` — which knows watts and percentages
 * but not zones — consume a document carrying `ZN` steps unchanged. A zone it
 * cannot resolve is left in place, so the step surfaces downstream as an
 * unresolved target rather than as a plausible wrong wattage.
 */
function resolveZoneTargets(
  doc: WorkoutDoc,
  anchors: ParseAnchors
): WorkoutDoc {
  const rewrite = (steps: PlannedDocStep[] | undefined): PlannedDocStep[] =>
    (steps ?? []).map((step) => {
      const inner = Array.isArray(step.steps)
        ? { steps: rewrite(step.steps) }
        : {};
      if (step.power?.units !== "power_zone") return { ...step, ...inner };
      const { target } = resolvePowerTarget(step.power, anchors);
      if (target?.low === undefined || target.high === undefined) {
        return { ...step, ...inner };
      }
      return {
        ...step,
        ...inner,
        power: {
          ...step.power,
          units: "w",
          value: undefined,
          start: target.low,
          end: target.high,
        },
      };
    });

  return { ...doc, steps: rewrite(doc.steps) };
}
