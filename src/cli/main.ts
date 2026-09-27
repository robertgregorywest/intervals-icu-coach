import { parseArgs } from "node:util";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { IServices } from "../index.js";
import { TOOLS } from "../registry.js";
import { STATIC_INSTRUCTIONS } from "../mcp/syntax-doc.js";
import { formatToolError } from "../errors.js";

export interface CliIO {
  stdout(s: string): void;
  stderr(s: string): void;
  exit(code: number): void;
  isTTY: boolean;
}

function serialize(value: unknown, isTTY: boolean): string {
  return isTTY ? JSON.stringify(value, null, 2) : JSON.stringify(value);
}

export async function runCli(
  argv: string[],
  getServices: () => IServices,
  io: CliIO
): Promise<void> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      json: { type: "string" },
      file: { type: "string" },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: false,
  });

  if (values.help || positionals[0] === "help") {
    io.stdout(
      "Usage: icu <command> [--json <json>] [--file <path>] [--yes]\n" +
        "       icu describe [<name...>]\n\n" +
        "Run `icu describe` to get the full tool catalogue with input schemas.\n" +
        "Run `icu describe <name>` for a specific tool's schema.\n" +
        "Run `icu --help` to show this message."
    );
    io.exit(0);
    return;
  }

  const [command, ...rest] = positionals;

  if (!command) {
    io.stderr(
      "No command given. Run `icu describe` for the tool catalogue or `icu --help` for usage."
    );
    io.exit(1);
    return;
  }

  // describe [name...]
  if (command === "describe") {
    const names = rest.length > 0 ? rest : null;

    if (names) {
      const missing = names.filter((n) => !TOOLS.find((t) => t.name === n));
      if (missing.length > 0) {
        io.stderr(
          `Unknown tool(s): ${missing.join(", ")}. Run \`icu describe\` for the full list.`
        );
        io.exit(1);
        return;
      }
    }

    const tools = (
      names ? TOOLS.filter((t) => names.includes(t.name)) : TOOLS
    ).map((t) => ({
      name: t.name,
      description: t.description,
      annotations: t.annotations,
      inputSchema: zodToJsonSchema(t.schema),
    }));

    io.stdout(
      serialize({ instructions: STATIC_INSTRUCTIONS, tools }, io.isTTY)
    );
    return;
  }

  // tool invocation
  const toolDef = TOOLS.find((t) => t.name === command);
  if (!toolDef) {
    io.stderr(
      `Unknown command: "${command}". Run \`icu describe\` for the tool catalogue.`
    );
    io.exit(1);
    return;
  }

  // resolve JSON input
  let rawInput: unknown = {};
  if (values.json) {
    try {
      rawInput = JSON.parse(values.json as string);
    } catch {
      io.stderr(`Invalid JSON in --json: ${values.json}`);
      io.exit(1);
      return;
    }
  } else if (values.file) {
    const { readFileSync } = await import("node:fs");
    try {
      rawInput = JSON.parse(readFileSync(values.file as string, "utf-8"));
    } catch (e) {
      io.stderr(
        `Failed to read --file "${values.file}": ${(e as Error).message}`
      );
      io.exit(1);
      return;
    }
  }

  // validate input
  const parsed = toolDef.schema.safeParse(rawInput);
  if (!parsed.success) {
    io.stderr(`Validation error: ${parsed.error.message}`);
    io.exit(1);
    return;
  }

  // mutation guard
  if (toolDef.annotations.destructiveHint && !values.yes) {
    io.stderr(
      `"${command}" is a destructive operation. Re-run with --yes to confirm.`
    );
    io.exit(1);
    return;
  }

  // invoke handler
  try {
    const result = await toolDef.handler(getServices(), parsed.data);
    io.stdout(serialize(result, io.isTTY));
  } catch (error) {
    io.stderr(formatToolError(error as Error));
    io.exit(1);
  }
}
