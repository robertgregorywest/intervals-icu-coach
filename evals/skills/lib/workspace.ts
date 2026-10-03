import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

// Paths never copied into a run's workspace: the eval suite and the skill that
// builds its cases (the agent must not see how it is graded), and trees
// irrelevant to coaching.
const EXCLUDE = [
  "evals",
  ".claude/skills/eval-case",
  "docs/evals.md",
  "docs/adr/0009-skill-evals.md",
  "tests",
  ".github",
  "docs/personal",
];

// Also removed for the no-skills baseline arm: the skills and the agent
// types their forks run in.
const SKILL_PATHS = [".claude/skills", ".claude/agents"];

export type SubagentModel = "inherit" | "pinned";

export interface WorkspaceOptions {
  repoRoot: string;
  caseDir: string;
  subagentModel: SubagentModel;
  /** False for the no-skills baseline arm. */
  skills: boolean;
}

/**
 * A throwaway copy of the working tree — uncommitted skill edits included —
 * with the scenario's personal files at `docs/personal/`.
 */
export function buildWorkspace(opts: WorkspaceOptions): string {
  const ws = mkdtempSync(join(tmpdir(), "icu-eval-"));
  const exclude = opts.skills ? EXCLUDE : [...EXCLUDE, ...SKILL_PATHS];
  const files = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: opts.repoRoot }
  )
    .toString()
    .split("\0")
    .filter(Boolean)
    .filter((f) => !exclude.some((p) => f === p || f.startsWith(`${p}/`)));

  for (const file of files) {
    const src = join(opts.repoRoot, file);
    if (!existsSync(src) && !isSymlink(src)) continue; // deleted, not staged
    const dst = join(ws, file);
    mkdirSync(dirname(dst), { recursive: true });
    if (isSymlink(src)) symlinkSync(readlinkSync(src), dst);
    else copyFileSync(src, dst);
  }
  symlinkSync(join(opts.repoRoot, "node_modules"), join(ws, "node_modules"));

  const personal = join(opts.caseDir, "personal");
  if (existsSync(personal)) {
    cpSync(personal, join(ws, "docs", "personal"), { recursive: true });
  }

  // The agent definitions pin their fork to sonnet, which would hide the
  // model under test in every forked skill.
  if (opts.subagentModel === "inherit") {
    const agentsDir = join(ws, ".claude", "agents");
    for (const f of existsSync(agentsDir) ? readdirSync(agentsDir) : []) {
      const path = join(agentsDir, f);
      const text = readFileSync(path, "utf8");
      writeFileSync(path, text.replace(/^model: .*$/m, "model: inherit"));
    }
  }
  return ws;
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}
