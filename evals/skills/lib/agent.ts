import { appendFileSync } from "node:fs";
import { join } from "node:path";
import {
  query,
  type ModelUsage,
  type Options,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type { Effort, EvalCase, TokenCounts } from "./types.js";

export interface AgentRunOptions {
  evalCase: EvalCase;
  workspace: string;
  runDir: string;
  model: string;
  effort: Effort;
  env: Record<string, string>;
  /** Domains the sandboxed Bash may reach; empty under replay. */
  allowedDomains: string[];
  /** Outside the workspace, where bin/icu writes captures, misses and cassettes. */
  writableDirs: string[];
  maxBudgetUsd?: number;
}

export interface AgentRunResult {
  messages: SDKMessage[];
  error: string | null;
  costUsd: number;
  turns: number;
  durationMs: number;
  modelUsage: Record<string, ModelUsage>;
  /** Summed over every model the session used, forks included. */
  tokens: TokenCounts;
  claudeVersion: string | null;
}

function sumTokens(usage: Record<string, ModelUsage>): TokenCounts {
  const t: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const u of Object.values(usage)) {
    t.input += u.inputTokens;
    t.output += u.outputTokens;
    t.cacheRead += u.cacheReadInputTokens;
    t.cacheWrite += u.cacheCreationInputTokens;
  }
  return t;
}

function userMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    session_id: "",
    message: { role: "user", content: [{ type: "text", text }] },
    parent_tool_use_id: null,
  };
}

export async function runAgent(opts: AgentRunOptions): Promise<AgentRunResult> {
  const { evalCase } = opts;
  const transcript = join(opts.runDir, "transcript.jsonl");
  const abort = new AbortController();
  const timeoutMs = (evalCase.timeoutSeconds ?? 900) * 1000;
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const uid = process.getuid?.() ?? 0;

  // Followups go in as later user turns, each released by the previous
  // turn's result message.
  let releaseTurn: () => void = () => {};
  async function* turns(): AsyncGenerator<SDKUserMessage> {
    yield userMessage(evalCase.prompt);
    for (const followup of evalCase.followups ?? []) {
      await new Promise<void>((resolve) => (releaseTurn = resolve));
      yield userMessage(followup);
    }
    await new Promise<void>((resolve) => (releaseTurn = resolve));
  }

  const options: Options = {
    cwd: opts.workspace,
    model: opts.model,
    effort: opts.effort,
    // Project skills, agents and CLAUDE.md; nothing from the user's own setup.
    settingSources: ["project"],
    // The run's own transcript.jsonl is the record; keep it out of ~/.claude/projects.
    persistSession: false,
    permissionMode: "dontAsk",
    allowedTools: [
      "Read",
      "Glob",
      "Grep",
      "Skill",
      "Agent",
      "Task",
      "Bash",
      "TodoWrite",
    ],
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,
      // `npx tsx` (bin/icu) binds an IPC pipe under the sandbox's own
      // $TMPDIR, /tmp/claude-<uid>/tsx-<uid>. Unix sockets are local only;
      // egress stays limited to allowedDomains.
      network: {
        allowedDomains: opts.allowedDomains,
        allowAllUnixSockets: true,
      },
      filesystem: {
        allowWrite: [
          `/tmp/claude-${uid}`,
          `/private/tmp/claude-${uid}`,
          ...opts.writableDirs,
        ],
      },
    },
    // Sandboxed egress goes through a filtering proxy; Node's fetch only
    // honours HTTPS_PROXY with this set.
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", ...opts.env },
    maxTurns: evalCase.maxTurns ?? 40,
    maxBudgetUsd: opts.maxBudgetUsd,
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append:
        `Today's date is ${evalCase.scenarioDate}. Treat it as the current date ` +
        `for everything in this session, whatever any other date source says.`,
    },
    abortController: abort,
    stderr: (data) => appendFileSync(join(opts.runDir, "stderr.log"), data),
  };

  const messages: SDKMessage[] = [];
  const result: AgentRunResult = {
    messages,
    error: null,
    costUsd: 0,
    turns: 0,
    durationMs: 0,
    modelUsage: {},
    tokens: sumTokens({}),
    claudeVersion: null,
  };
  const started = Date.now();
  try {
    const prompt = evalCase.followups?.length ? turns() : evalCase.prompt;
    for await (const m of query({ prompt, options })) {
      messages.push(m);
      appendFileSync(transcript, JSON.stringify(m) + "\n");
      if (m.type === "system" && m.subtype === "init") {
        result.claudeVersion = m.claude_code_version;
      }
      if (m.type === "result") {
        result.costUsd = m.total_cost_usd;
        result.turns += m.num_turns;
        // Session totals, like total_cost_usd: the latest result has them all.
        result.modelUsage = m.modelUsage;
        result.tokens = sumTokens(m.modelUsage);
        if (m.subtype !== "success") result.error = m.subtype;
        releaseTurn();
      }
    }
  } catch (err) {
    result.error = abort.signal.aborted
      ? `timed out after ${timeoutMs / 1000}s`
      : err instanceof Error
        ? err.message
        : String(err);
  } finally {
    clearTimeout(timer);
    result.durationMs = Date.now() - started;
  }
  return result;
}
