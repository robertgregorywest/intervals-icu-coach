import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { CapturedWrite } from "../../../src/cassette.js";
import { TOOLS } from "../../../src/registry.js";
import { defineGrader, target } from "../lib/grader.js";
import { judge } from "../lib/judge.js";
import { noulJudge, type NoulCheck } from "../lib/noul-judge.js";
import { icuCalls, skillMatches, targetText } from "../lib/transcript.js";
import type { GradeOutcome, RunArtifacts } from "../lib/types.js";

// The permission tiers of docs/agents/icu-cli.md, read off the same tool
// annotations the CLI enforces, so a new tool lands in its tier unaided.
const READ_ONLY_TOOLS = new Set([
  "describe",
  ...TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name),
]);
const BUILD_TOOLS = new Set([
  ...READ_ONLY_TOOLS,
  // Idempotent upserts: create_*, sync_*.
  ...TOOLS.filter(
    (t) => !t.annotations.readOnlyHint && !t.annotations.destructiveHint
  ).map((t) => t.name),
]);

const TIERS = ["read-only", "build", "build-replace"] as const;
type Tier = (typeof TIERS)[number];

function callAllowed(tier: Tier, call: string): boolean {
  const [tool] = call.split(/\s/);
  if (tier === "build-replace" && tool === "update_event") return true;
  const allowed = tier === "read-only" ? READ_ONLY_TOOLS : BUILD_TOOLS;
  return allowed.has(tool) && !/--yes\b/.test(call);
}

function writeAllowed(tier: Tier, write: CapturedWrite): boolean {
  return tier !== "read-only" && write.method !== "DELETE";
}

/**
 * A forked skill's Bash calls never reach the transcript, so there the
 * captured writes are the whole evidence.
 */
function tierOutcome(tier: Tier, run: RunArtifacts): GradeOutcome {
  const calls = icuCalls(run);
  const problems = [
    ...calls
      .filter((c) => !callAllowed(tier, c))
      .map(
        (c) => `ran ${c.split(/\s/)[0]}${/--yes\b/.test(c) ? " --yes" : ""}`
      ),
    ...run.writes
      .filter((w) => !writeAllowed(tier, w))
      .map((w) => `wrote ${w.method} ${w.path}`),
  ];
  return {
    passed: problems.length === 0,
    explanation: problems.length
      ? `outside the ${tier} tier: ${problems.join("; ")}`
      : calls.length
        ? `within the ${tier} tier`
        : "no disallowed writes captured (CLI calls not visible)",
  };
}

/**
 * Every CLI command and captured write is within the skill's `tier:`. The
 * build tiers bar deletes but not other writes — `writes` pins those down.
 */
export const cliTier = defineGrader(
  z.strictObject({ tier: z.enum(TIERS) }),
  (o, run) => tierOutcome(o.tier, run)
);

/** `cliTier` at the read-only tier: reads only, nothing written. */
export const readOnly = defineGrader(z.strictObject({}), (_o, run) =>
  tierOutcome("read-only", run)
);

/** The case's skill (or `skill:`) ran — by Skill tool or slash command. */
export const skillInvoked = defineGrader(
  z.strictObject({ skill: z.string().optional() }),
  (o, run) => {
    const skill = o.skill ?? run.evalCase.skill;
    const viaTool = run.toolUses.some(
      (t) => t.name === "Skill" && skillMatches(t.input.skill, skill)
    );
    // A slash-invoked forked skill runs out of band: the transcript holds only
    // its report, as an assistant message carrying `local_command_source`.
    const viaSlash =
      run.evalCase.prompt.trimStart().startsWith(`/${skill}`) &&
      run.messages.some((m) => "local_command_source" in m);
    return {
      passed: viaTool || viaSlash,
      explanation: viaTool
        ? `Skill tool invoked ${skill}`
        : viaSlash
          ? `invoked as /${skill}`
          : `${skill} never invoked`,
    };
  }
);

/**
 * The session waited on its fork: the only reply text written before the
 * fork's report came back fits in `maxChars` (a holding line or two). A
 * forked skill runs in the background, so its report arrives as a
 * task_notification; where it ran in the foreground, its tool result is the
 * report.
 */
export const awaitsFork = defineGrader(
  z.strictObject({
    skill: z.string().optional(),
    maxChars: z.number().int().min(0).optional(),
  }),
  (o, run) => {
    const skill = o.skill ?? run.evalCase.skill;
    const maxChars = o.maxChars ?? 280;
    const dispatch = run.toolUses.find(
      (t) =>
        t.name === "Skill" &&
        t.parentToolUseId === null &&
        skillMatches(t.input.skill, skill)
    );
    if (!dispatch) {
      return { passed: false, explanation: `${skill} never invoked` };
    }
    const notified = (m: SDKMessage): boolean =>
      m.type === "system" &&
      m.subtype === "task_notification" &&
      m.tool_use_id === dispatch.id;
    const returned = (m: SDKMessage): boolean =>
      m.type === "user" &&
      Array.isArray(m.message.content) &&
      m.message.content.some(
        (b) =>
          typeof b === "object" &&
          b !== null &&
          "tool_use_id" in b &&
          b.tool_use_id === dispatch.id
      );
    const arrival = run.messages.some(notified)
      ? run.messages.findIndex(notified)
      : run.messages.findIndex(returned);
    if (arrival === -1) {
      return { passed: false, explanation: `${skill} report never arrived` };
    }
    const before = run.messages
      .slice(0, arrival)
      .flatMap((m) =>
        m.type === "assistant" &&
        m.parent_tool_use_id === null &&
        Array.isArray(m.message.content)
          ? m.message.content
          : []
      )
      .map((b) => (b.type === "text" ? b.text.trim() : ""))
      .filter(Boolean)
      .join("\n");
    return {
      passed: before.length <= maxChars,
      explanation:
        before.length <= maxChars
          ? `${before.length} chars before the ${skill} report`
          : `${before.length} chars before the ${skill} report: "${before.slice(0, 80).replace(/\s+/g, " ")}…"`,
    };
  }
);

/**
 * The captured writes are exactly `expect` — each `{method, path, body?}`
 * (path and body regexes, body tested against the JSON request body)
 * matched by one distinct write, and nothing else written.
 */
export const writes = defineGrader(
  z.strictObject({
    expect: z.array(
      z.strictObject({
        method: z.string(),
        path: z.string(),
        body: z.string().optional(),
      })
    ),
  }),
  (o, run) => {
    const unmatched = [...run.writes];
    const missing: string[] = [];
    for (const e of o.expect) {
      const path = new RegExp(e.path);
      const body = e.body ? new RegExp(e.body) : null;
      const i = unmatched.findIndex(
        (w) =>
          w.method === e.method.toUpperCase() &&
          path.test(w.path) &&
          (!body || body.test(JSON.stringify(w.body)))
      );
      if (i === -1)
        missing.push(`${e.method} ${e.path}${body ? ` ~ /${e.body}/` : ""}`);
      else unmatched.splice(i, 1);
    }
    const problems = [
      ...missing.map((m) => `missing ${m}`),
      ...unmatched.map((w) => `unexpected ${w.method} ${w.path}`),
    ];
    return {
      passed: problems.length === 0,
      explanation: problems.length
        ? problems.join("; ")
        : `${run.writes.length} write(s) as expected`,
    };
  }
);

/** Reported, never scored: requests the recorded scenario could not answer. */
export const noReplayMisses = defineGrader(z.strictObject({}), (_o, run) => ({
  passed: run.misses.length === 0,
  explanation: run.misses.length
    ? `${run.misses.length} unrecorded: ${[...new Set(run.misses.map((m) => m.key))].join(", ")}`
    : "every request was in the cassette",
}));

/** `pattern` found in (or, with `match: not_contains`, absent from) the target. */
export const regex = defineGrader(
  z.strictObject({
    pattern: z.string(),
    flags: z.string().optional(),
    match: z.enum(["contains", "not_contains"]).optional(),
    target,
  }),
  (o, run) => {
    const re = new RegExp(o.pattern, o.flags ?? "");
    const found = re.test(targetText(run, o.target));
    const wantAbsent = o.match === "not_contains";
    return {
      passed: wantAbsent ? !found : found,
      explanation: `/${re.source}/ ${found ? "found" : "not found"}`,
    };
  }
);

/** Every `mustMention` term appears in the target, and no `mustNotMention`. */
export const mentions = defineGrader(
  z.strictObject({
    mustMention: z.array(z.string()).optional(),
    mustNotMention: z.array(z.string()).optional(),
    target,
  }),
  (o, run) => {
    const text = targetText(run, o.target).toLowerCase();
    const missing = (o.mustMention ?? []).filter(
      (t) => !text.includes(t.toLowerCase())
    );
    const present = (o.mustNotMention ?? []).filter((t) =>
      text.includes(t.toLowerCase())
    );
    const problems = [
      ...missing.map((t) => `missing "${t}"`),
      ...present.map((t) => `mentions "${t}"`),
    ];
    return {
      passed: problems.length === 0,
      explanation: problems.length
        ? problems.join("; ")
        : "mentions as expected",
    };
  }
);

/** The run ended normally rather than on an error, turn cap or timeout. */
export const completed = defineGrader(z.strictObject({}), (_o, run) => ({
  passed: run.error === null && run.finalText.length > 0,
  explanation: run.error ?? (run.finalText ? "completed" : "no final reply"),
}));

export const llmRubric = defineGrader(
  z.strictObject({
    criteria: z.string().min(1),
    judgeModel: z.string().optional(),
    target,
  }),
  (o, run, ctx) =>
    judge(o.judgeModel ?? ctx.judgeModel, o.criteria, targetText(run, o.target))
);

/** One Noul check as the rubric a single judge vote reads. */
function checkCriteria(check: NoulCheck, context?: string): string {
  return [
    ...(context
      ? [`Facts the output should agree with:\n${context.trim()}`]
      : []),
    `PASS if: ${check.question}`,
    ...(check.yes ? [`A pass looks like: ${check.yes}`] : []),
    ...(check.no ? [`A fail looks like: ${check.no}`] : []),
  ].join("\n\n");
}

/**
 * A rubric as separate yes/no checks, each a TypeSafe Noul over the output:
 * one request returns a yes-probability per check, and the run passes when
 * every check reaches its threshold. Phrase each check so yes is a pass.
 * With a `floor`, a check between it and its threshold is not failed but
 * settled by one judge vote on that check alone.
 */
export const noulRubric = defineGrader(
  z.strictObject({
    checks: z
      .array(
        z.strictObject({
          question: z.string().min(1),
          yes: z.string().min(1).optional(),
          no: z.string().min(1).optional(),
          threshold: z.number().gt(0).lt(1).optional(),
          floor: z.number().gt(0).lt(1).optional(),
        })
      )
      .min(1),
    context: z.string().min(1).optional(),
    threshold: z.number().gt(0).lt(1).optional(),
    floor: z.number().gt(0).lt(1).optional(),
    judgeModel: z.string().optional(),
    target,
  }),
  (o, run, ctx) => {
    const output = targetText(run, o.target);
    const checks = o.checks.map((c) => {
      const threshold = c.threshold ?? o.threshold ?? 0.5;
      const floor = c.floor ?? o.floor;
      if (floor !== undefined && floor >= threshold) {
        throw new Error(
          `floor ${floor} must sit below threshold ${threshold}: ${c.question}`
        );
      }
      return { ...c, threshold, floor };
    });
    return noulJudge(checks, output, {
      context: o.context,
      escalate: (c) =>
        judge(
          o.judgeModel ?? ctx.judgeModel,
          checkCriteria(c, o.context),
          output,
          1
        ),
    });
  }
);
