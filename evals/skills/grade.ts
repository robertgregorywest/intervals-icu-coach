// Re-grades one run against a case's current graders, without running the
// agent (issue #20). Two uses:
//
// - A stored run, after editing the case's graders:
//     npm run eval:grade -- --case <id> --run <runDir>
// - A hand-made run, to prove the graders catch a bad one — its writes as
//   JSONL of {method, path, body} and/or its reply as text:
//     npm run eval:grade -- --case <id> --writes bad.jsonl [--final bad.md]
//
// A hand-made run has no transcript, so graders that read one (completed,
// skillInvoked, noReplayMisses) are skipped. The judged graders (llmRubric,
// noulRubric) are skipped unless --judge is given, since they cost money.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { CapturedWrite, ReplayMiss } from "../../src/cassette.js";
import { gradeRun, score } from "./graders/index.js";
import { loadCases } from "./lib/case.js";
import { readJsonl } from "./lib/jsonl.js";
import { extract } from "./lib/transcript.js";
import type { Arm, RunArtifacts } from "./lib/types.js";

const REPO_ROOT = resolve(import.meta.dirname, "../..");

const { values: args } = parseArgs({
  options: {
    case: { type: "string" },
    run: { type: "string" },
    writes: { type: "string" },
    final: { type: "string" },
    judge: { type: "boolean", default: false },
    "judge-model": { type: "string", default: "claude-sonnet-5" },
    scenarios: { type: "string", default: "docs/personal/evals/scenarios" },
  },
});

if (!args.case || (!args.run && !args.writes && !args.final)) {
  throw new Error(
    "usage: eval:grade -- --case <id> (--run <runDir> | --writes <file> [--final <file>]) [--judge]"
  );
}
const [evalCase] = loadCases(resolve(REPO_ROOT, args.scenarios), {
  caseGlob: args.case,
});
if (!evalCase || evalCase.id !== args.case) {
  throw new Error(`No case ${args.case}`);
}

interface StoredRun {
  error?: string | null;
  arm?: Arm;
}

let arm: Arm = "skills";

function stored(runDir: string): RunArtifacts {
  const dir = resolve(runDir);
  const messages = readJsonl<SDKMessage>(join(dir, "transcript.jsonl"));
  if (messages.length === 0) throw new Error(`No transcript in ${dir}`);
  const runJson = join(dir, "run.json");
  const rec: StoredRun = existsSync(runJson)
    ? (JSON.parse(readFileSync(runJson, "utf8")) as StoredRun)
    : {};
  arm = rec.arm ?? "skills";
  return {
    evalCase,
    messages,
    ...extract(messages),
    writes: readJsonl<CapturedWrite>(join(dir, "writes.jsonl")),
    misses: readJsonl<ReplayMiss>(join(dir, "misses.jsonl")),
    error: rec.error ?? null,
  };
}

function handMade(): RunArtifacts {
  return {
    evalCase,
    messages: [],
    toolUses: [],
    toolResults: new Map(),
    finalText: args.final ? readFileSync(resolve(args.final), "utf8") : "",
    writes: args.writes ? readJsonl<CapturedWrite>(resolve(args.writes)) : [],
    misses: [],
    error: null,
  };
}

const run = args.run ? stored(args.run) : handMade();
const NEEDS_TRANSCRIPT = new Set([
  "completed",
  "skillInvoked",
  "noReplayMisses",
]);
const JUDGED = new Set(["llmRubric", "noulRubric"]);
const skipped = evalCase.graders.filter(
  (g) =>
    (!args.run && NEEDS_TRANSCRIPT.has(g.type)) ||
    (!args.judge && JUDGED.has(g.type))
);
run.evalCase = {
  ...evalCase,
  graders: evalCase.graders.filter((g) => !skipped.includes(g)),
};

const grades = await gradeRun(run, {
  judgeModel: args["judge-model"]!,
  arm,
});
for (const g of grades) {
  console.log(
    `${g.passed ? "✓" : "✗"} ${g.name}${g.weight === 0 ? " (info)" : ""}: ${g.explanation}`
  );
}
for (const g of skipped) {
  console.log(
    `– ${String(g.name ?? g.type)}: skipped (${JUDGED.has(g.type) ? "pass --judge" : "needs a transcript"})`
  );
}
const s = score(grades);
console.log(
  `\nscore ${s.toFixed(2)} over ${grades.filter((g) => g.weight > 0).length} scored grader(s) — ${s === 1 ? "PASSES" : "FAILS"}`
);
