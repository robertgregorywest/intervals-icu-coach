import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TOOLS } from "../src/registry.js";
import { WORK_WORDS } from "../src/shared/work-words.js";
import { createPrescription } from "../src/services/prescription/index.js";
import { createWorkoutParser } from "../src/services/workout-parser/index.js";

/**
 * The skills are prompts, so nothing type-checks what they tell an agent to do.
 * These tests read them as data and hold each claim they make about the code —
 * a tool name, a permission tier, the work-word vocabulary, a worked example —
 * against the code itself, so a skill cannot drift from what it describes.
 */

const root = resolve(fileURLToPath(import.meta.url), "../..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

function markdownUnder(dir: string): string[] {
  return readdirSync(join(root, dir), { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(dir, f));
}

/** Everything an agent reads as instructions for reaching the tools. */
const INSTRUCTION_FILES = [
  ...markdownUnder(".claude/skills"),
  ...markdownUnder(".claude/agents"),
  "docs/agents/icu-cli.md",
];

const TOOL_NAMES = new Set(TOOLS.map((t) => t.name));
const TOOL_PREFIXES = [
  ...new Set(TOOLS.map((t) => t.name.split("_")[0]!)),
].join("|");

describe("every tool a skill names is a registered Tool", () => {
  it.each(INSTRUCTION_FILES)("%s", (file) => {
    const named = read(file).match(
      new RegExp(`\\b(?:${TOOL_PREFIXES})_[a-z0-9_]*[a-z0-9]\\b`, "g")
    );
    const unknown = [...new Set(named ?? [])].filter(
      (name) => !TOOL_NAMES.has(name)
    );
    expect(unknown, `named in ${file} but not registered`).toEqual([]);
  });
});

describe("the permission tiers in icu-cli.md match the annotations the CLI enforces", () => {
  const cli = read("docs/agents/icu-cli.md");

  /** The `prefix_*` globs in one row of the tier table. */
  function globs(tier: string): string[] {
    const row = cli.split("\n").find((l) => l.startsWith(`| **${tier}**  `));
    expect(row, `a ${tier} row`).toBeDefined();
    return [...row!.matchAll(/`([a-z]+)_\*`/g)].map((m) => m[1]!);
  }
  const readOnly = globs("Read-only");
  const build = globs("Build");
  const tierOf = (name: string) => {
    const prefix = name.split("_")[0]!;
    if (readOnly.includes(prefix)) return "read-only";
    if (build.includes(prefix)) return "build";
    return "coaching";
  };

  it.each(TOOLS.map((t) => [t.name, t] as const))("%s", (name, tool) => {
    const { readOnlyHint, destructiveHint } = tool.annotations;
    const expected = readOnlyHint
      ? "read-only"
      : destructiveHint
        ? "coaching"
        : "build";
    expect(tierOf(name)).toBe(expected);
  });
});

describe("the work-word table in the syntax cheatsheet is the vocabulary", () => {
  const prescription = createPrescription({
    workoutParser: createWorkoutParser(),
  });
  const cheatsheet = read(
    ".claude/skills/compose-workout/syntax-cheatsheet.md"
  );
  const table = cheatsheet
    .split("## What a step label declares")[1]!
    .split("\n\n")
    .find((block) => block.startsWith("| Group"))!;
  const entries = [...table.matchAll(/`([^`]+)`/g)].map((m) => m[1]!);

  it("lists entries", () => {
    expect(entries.length).toBeGreaterThan(0);
  });

  it.each(entries)("%s declares a work step", (entry) => {
    const [step] = prescription.read(`- ${entry} 1m 300w`).steps;
    expect(step?.role).toBe("work");
  });

  it("lists every word the code accepts", () => {
    const listed = new Set(
      entries.flatMap((e) => {
        const lower = e.toLowerCase();
        return [lower.split(" ")[0]!, lower.replace(/\s+/g, "")];
      })
    );
    const unlisted = [...WORK_WORDS].filter((w) => !listed.has(w));
    expect(unlisted).toEqual([]);
  });
});

describe("the worked examples a composer copies label every hard step", () => {
  const prescription = createPrescription({
    workoutParser: createWorkoutParser(),
  });
  // An FTP at which every example's hard steps clear the key-session floor.
  // Template percentages are MAP-based, and reading them against FTP only
  // makes more of their steps hard, so the check is stricter, never looser.
  const anchors = { ftp: 280 };

  const examples = [
    ...markdownUnder(".claude/skills/compose-workout"),
    ...markdownUnder(".claude/skills/plan-workout"),
  ].flatMap((file) =>
    [...read(file).matchAll(/```(?:markdown)?\n([\s\S]*?)```/g)]
      .map((m) => m[1]!.replace(/^---\n[\s\S]*?\n---\n/, ""))
      // Workout text only: step lines, but not the `[label] [duration]` shape.
      .filter((body) => /^- /m.test(body) && !body.includes("[label]"))
      .map((body, i) => [`${relative(".claude/skills", file)} #${i + 1}`, body])
  );

  it("finds the examples", () => {
    expect(examples.length).toBeGreaterThanOrEqual(3);
  });

  it.each(examples)("%s", (_where, body) => {
    const read = prescription.read(body, anchors);
    expect(read.discarded, "lines the platform would drop").toEqual([]);
    expect(
      read.unreviewable.map((s) => s.label ?? `(unlabelled ${s.index})`),
      "hard steps no review will judge"
    ).toEqual([]);
  });
});
