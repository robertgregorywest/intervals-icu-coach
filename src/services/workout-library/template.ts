import { z } from "zod";
import {
  FrontmatterError,
  parseFrontmatter,
  type Frontmatter,
} from "../../shared/frontmatter.js";
import type { AnchorBasis } from "./types.js";

/**
 * A Workout template: the tracked Markdown file that is the source of truth for
 * one curated library workout (ADR 0005).
 *
 * File shape:
 *
 *     ---
 *     seedId: vo2-4x4
 *     name: VO2 4×4
 *     folder: "Coach: VO2 Max"
 *     basis: MAP
 *     purpose: Default VO2 session. Highest time-at-VO2max per minute of work.
 *     ---
 *
 *     Free prose (rationale, citations) — rendered above the steps.
 *
 *     - Warm-up 15m 50-60%
 *
 *     4x
 *       - On 4m 95-102%
 *       - Off 4m 50%
 *
 *     - Cooldown 10m 45%
 *
 * A bare percentage resolves against `basis` at render time. Every other target
 * token — literal watts, `Z2`, `70% HR`, `5:00/km Pace` — is emitted verbatim
 * and does not move when MAP/FTP moves. A template with no bare percentage
 * needs no `basis` and always syncs.
 *
 * A ladder line — `- Ramp 1m 140w +25w until MAP+2` — is a fixed rung sequence
 * (start watts, fixed increment) whose only MAP-dependent part is where it
 * stops: the first rung above MAP, plus N more. Start and step never move, so
 * a longer ladder is the same protocol run further up (ADR 0011).
 *
 * Repeat blocks nest by indentation. At render, a block containing another
 * block is unrolled (its label discarded) and a block of plain steps is emitted
 * as a native `Nx` — Intervals.icu supports only a single level.
 */

export type Pct = number | [number, number];

export interface TemplateStep {
  kind: "step";
  label?: string;
  duration: string;
  /** Raw target text, e.g. "95-102%", "350w", "70% LTHR", "Z2". */
  target?: string;
  cadence?: string;
  /** Set when `target` was a bare percentage, i.e. anchored to the basis. */
  anchored?: Pct;
}

export interface TemplateRepeat {
  kind: "repeat";
  iterations: number;
  label?: string;
  children: TemplateNode[];
}

export interface TemplateLadder {
  kind: "ladder";
  label?: string;
  duration: string;
  startWatts: number;
  stepWatts: number;
  /** Rungs to add above the first rung that exceeds MAP. */
  headroomSteps: number;
}

export type TemplateNode = TemplateStep | TemplateRepeat | TemplateLadder;

export interface WorkoutTemplate {
  seedId: string;
  name: string;
  folder: string;
  purpose: string;
  basis?: AnchorBasis;
  type: string;
  prose: string;
  steps: TemplateNode[];
}

export class TemplateParseError extends Error {
  constructor(file: string, line: number | null, message: string) {
    super(`${file}${line === null ? "" : `:${line}`} — ${message}`);
    this.name = "TemplateParseError";
  }
}

const metaSchema = z.object({
  seedId: z
    .string()
    .min(1)
    .regex(
      /^[a-z0-9][a-z0-9-]*$/,
      "seedId must be lower-case kebab-case (it is the stable identity used to match the library workout)"
    ),
  name: z.string().min(1),
  folder: z.string().min(1),
  purpose: z.string().min(1, "purpose is required on every template"),
  basis: z.enum(["MAP", "FTP"]).optional(),
  type: z.string().min(1).default("Ride"),
});

/** A token is a duration only if the whole token is duration units. */
const DURATION_TOKEN_RE = /^(?:\d+(?:km|mtr|h|m|s))+$/i;
/** A bare percentage — no trailing modifier — is anchored to the basis. */
const BARE_PCT_RE = /^(\d+(?:\.\d+)?)(?:-(\d+(?:\.\d+)?))?%$/;
const CADENCE_RE = /^\d+rpm$/i;
const LADDER_RE = /^(\d+)w\s+\+(\d+)w\s+until\s+MAP\+(\d+)$/i;
const REPEAT_RE = /^(?:(.*?)\s+)?(\d+)x$/;
const STEP_RE = /^-\s*(.*)$/;

/**
 * Tokens that Intervals.icu's own parser reads as duration, target or cadence.
 * A label containing one is silently eaten on the round-trip — a step labelled
 * `Z2` loses its label to the zone token, and `... best 60s` turns a 1-min step
 * into a 1-min-then-60s misread. Labels must be plain text.
 */
const LABEL_BANNED_RE = new RegExp(
  [
    /(?:\d+(?:km|mtr|h|m|s))+/, // duration: 5m, 30s, 1h2m30s, 2km
    /\d+(?:\.\d+)?(?:-\d+(?:\.\d+)?)?%/, // percentage: 75%, 95-102%
    /\d+w(?:-\d+w)?/, // watts: 220w, 160w-256w
    /\d+rpm/, // cadence: 90rpm
    /z\d/, // zone: Z2
  ]
    .map((r) => `^(?:${r.source})$`)
    .join("|"),
  "i"
);

/**
 * Reject a label carrying a token Intervals.icu will re-read as structure.
 * Enforced at parse time so a bad template fails at load rather than silently
 * shipping a mangled workout to the athlete's head unit.
 */
function assertLabelSafe(
  label: string,
  what: "step" | "repeat block",
  file: string,
  lineNo: number
): void {
  const bad = label.split(/\s+/).filter((t) => LABEL_BANNED_RE.test(t));
  if (bad.length === 0) return;
  throw new TemplateParseError(
    file,
    lineNo,
    `${what} label ${JSON.stringify(label)} contains ${bad.map((t) => `\`${t}\``).join(", ")}, ` +
      "which Intervals.icu reads as a duration, target, cadence or zone rather than as text. " +
      "Labels must be plain text — put numeric detail in the template's prose."
  );
}

interface RawLine {
  indent: number;
  text: string;
  lineNo: number;
}

/**
 * The shared frontmatter reader, its failures re-raised as the template's own
 * error so every template problem reads alike.
 */
function readFrontmatter(source: string, file: string): Frontmatter {
  try {
    return parseFrontmatter(source, file);
  } catch (err) {
    if (err instanceof FrontmatterError) {
      throw new TemplateParseError(file, err.line, err.detail);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Body
// ---------------------------------------------------------------------------

function parseStepLine(
  body: string,
  file: string,
  lineNo: number
): TemplateStep | TemplateLadder {
  const tokens = body.split(/\s+/).filter(Boolean);
  const durationIdx = tokens.findIndex((t) => DURATION_TOKEN_RE.test(t));
  if (durationIdx === -1) {
    throw new TemplateParseError(
      file,
      lineNo,
      `no duration found in step. Expected something like \`5m\`, \`30s\`, \`1h2m30s\`, \`2km\`.`
    );
  }

  const label = tokens.slice(0, durationIdx).join(" ") || undefined;
  if (label) assertLabelSafe(label, "step", file, lineNo);
  const duration = tokens[durationIdx];
  const rest = tokens.slice(durationIdx + 1);

  if (rest[0]?.toLowerCase() === "ramp") {
    throw new TemplateParseError(
      file,
      lineNo,
      "`ramp` steps collapse to a single averaged target on head units and cannot be executed. " +
        "Write explicit steps instead (see ADR 0005)."
    );
  }

  const ladder = rest.join(" ").match(LADDER_RE);
  if (ladder) {
    const stepWatts = Number(ladder[2]);
    if (stepWatts < 1) {
      throw new TemplateParseError(
        file,
        lineNo,
        "ladder increment must be at least 1 W"
      );
    }
    const node: TemplateLadder = {
      kind: "ladder",
      duration,
      startWatts: Number(ladder[1]),
      stepWatts,
      headroomSteps: Number(ladder[3]),
    };
    if (label) node.label = label;
    return node;
  }

  let cadence: string | undefined;
  if (rest.length > 0 && CADENCE_RE.test(rest[rest.length - 1])) {
    cadence = rest.pop();
  }

  const target = rest.length > 0 ? rest.join(" ") : undefined;
  const step: TemplateStep = { kind: "step", duration };
  if (label) step.label = label;
  if (target) step.target = target;
  if (cadence) step.cadence = cadence;

  if (target) {
    const m = target.match(BARE_PCT_RE);
    if (m) {
      step.anchored =
        m[2] === undefined ? Number(m[1]) : [Number(m[1]), Number(m[2])];
    }
  }
  return step;
}

/**
 * Parse the body into a node tree. Repeat blocks own the following lines that
 * are indented further than the `Nx` header; a blank line also closes a block.
 */
function parseNodes(
  lines: RawLine[],
  start: number,
  minIndent: number,
  file: string
): { nodes: TemplateNode[]; next: number } {
  const nodes: TemplateNode[] = [];
  let i = start;

  while (i < lines.length) {
    const line = lines[i];
    if (line.indent < minIndent) break;

    const repeat = line.text.match(REPEAT_RE);
    if (repeat) {
      const iterations = Number(repeat[2]);
      if (iterations < 1) {
        throw new TemplateParseError(
          file,
          line.lineNo,
          `repeat count must be at least 1, got ${iterations}`
        );
      }
      const inner = parseNodes(lines, i + 1, line.indent + 1, file);
      if (inner.nodes.length === 0) {
        throw new TemplateParseError(
          file,
          line.lineNo,
          `\`${iterations}x\` block is empty — its steps must be indented under it`
        );
      }
      const block: TemplateRepeat = {
        kind: "repeat",
        iterations,
        children: inner.nodes,
      };
      if (repeat[1]) {
        const label = repeat[1].trim();
        assertLabelSafe(label, "repeat block", file, line.lineNo);
        block.label = label;
      }
      nodes.push(block);
      i = inner.next;
      continue;
    }

    const step = line.text.match(STEP_RE);
    if (step) {
      const node = parseStepLine(step[1], file, line.lineNo);
      if (node.kind === "ladder" && minIndent > 0) {
        throw new TemplateParseError(
          file,
          line.lineNo,
          "a ladder cannot sit inside a repeat block"
        );
      }
      nodes.push(node);
      i++;
      continue;
    }

    throw new TemplateParseError(
      file,
      line.lineNo,
      `expected a step (\`- ...\`) or a repeat header (\`4x\`), got ${JSON.stringify(line.text)}`
    );
  }

  return { nodes, next: i };
}

/**
 * Split the body into leading prose and the step tree. Prose is everything
 * before the first step or repeat line.
 */
function splitBody(
  body: string,
  file: string,
  bodyStartLine: number
): { prose: string; lines: RawLine[] } {
  const raw = body.split(/\r?\n/);
  const proseLines: string[] = [];
  const lines: RawLine[] = [];
  let seenStep = false;

  for (let i = 0; i < raw.length; i++) {
    const text = raw[i].trim();
    const isStep = STEP_RE.test(text) || REPEAT_RE.test(text);
    if (!seenStep && !isStep) {
      proseLines.push(raw[i]);
      continue;
    }
    seenStep = true;
    if (text === "") continue;
    if (!isStep) {
      throw new TemplateParseError(
        file,
        bodyStartLine + i,
        `prose is not allowed between steps: ${JSON.stringify(text)}. ` +
          "Move it above the first step."
      );
    }
    lines.push({
      indent: raw[i].length - raw[i].trimStart().length,
      text,
      lineNo: bodyStartLine + i,
    });
  }

  return { prose: proseLines.join("\n").trim(), lines };
}

export function parseTemplate(source: string, file: string): WorkoutTemplate {
  const { meta, body, bodyStartLine } = readFrontmatter(source, file);

  const parsed = metaSchema.safeParse(meta);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    throw new TemplateParseError(file, null, `invalid frontmatter — ${issues}`);
  }

  const { prose, lines } = splitBody(body, file, bodyStartLine);
  const { nodes, next } = parseNodes(lines, 0, 0, file);
  if (next !== lines.length) {
    throw new TemplateParseError(
      file,
      lines[next]?.lineNo ?? null,
      "unexpected indentation — a step is indented under nothing"
    );
  }
  if (nodes.length === 0) {
    throw new TemplateParseError(file, null, "template has no steps");
  }

  const template: WorkoutTemplate = {
    ...parsed.data,
    prose,
    steps: nodes,
  };

  assertBasis(template, file);
  return template;
}

/** A template needs a basis if — and only if — it has an anchored step. */
function assertBasis(template: WorkoutTemplate, file: string): void {
  let anchored = 0;
  walk(template.steps, (s) => {
    if (s.anchored !== undefined) anchored++;
  });
  const ladders = template.steps.filter((n) => n.kind === "ladder").length;
  if (ladders > 0 && template.basis !== "MAP") {
    throw new TemplateParseError(
      file,
      null,
      "a ladder stops relative to MAP, so the template must declare `basis: MAP`."
    );
  }
  anchored += ladders;
  if (anchored > 0 && !template.basis) {
    throw new TemplateParseError(
      file,
      null,
      `${anchored} step(s) use a bare percentage but no \`basis\` is declared. ` +
        "Add `basis: MAP` or `basis: FTP`, or give those steps an explicit target."
    );
  }
  if (anchored === 0 && template.basis) {
    throw new TemplateParseError(
      file,
      null,
      `\`basis: ${template.basis}\` is declared but no step uses a bare percentage — remove it.`
    );
  }
}

export function walk(
  nodes: TemplateNode[],
  fn: (step: TemplateStep) => void
): void {
  for (const node of nodes) {
    if (node.kind === "repeat") walk(node.children, fn);
    else if (node.kind === "step") fn(node);
  }
}
