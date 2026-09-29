/**
 * Flat Markdown frontmatter, read the same way for every tracked record — a
 * **Workout template** and a track session record alike.
 */

/** A frontmatter problem, with the line it is on when there is one. */
export class FrontmatterError extends Error {
  constructor(
    file: string,
    readonly line: number | null,
    readonly detail: string
  ) {
    super(`${file}${line === null ? "" : `:${line}`} — ${detail}`);
    this.name = "FrontmatterError";
  }
}

export interface Frontmatter {
  meta: Record<string, string>;
  body: string;
  /** The 1-based line the body starts on, so body errors can name a line. */
  bodyStartLine: number;
}

/**
 * Minimal frontmatter: `key: value`, one line each, optional surrounding
 * quotes, split on the FIRST colon so values may contain colons (folder names
 * are `Coach: VO2 Max`). Anything YAML-ish beyond that is a parse error rather
 * than a silent misread.
 */
export function parseFrontmatter(source: string, file: string): Frontmatter {
  const lines = source.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") {
    throw new FrontmatterError(
      file,
      1,
      "must start with a `---` frontmatter fence"
    );
  }
  const meta: Record<string, string> = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) {
      throw new FrontmatterError(
        file,
        i + 1,
        `frontmatter line has no colon: ${JSON.stringify(line)}. ` +
          "Values must be a single line of `key: value`."
      );
    }
    const key = line.slice(0, colon).trim();
    let value = line.slice(colon + 1).trim();
    if (key === "") {
      throw new FrontmatterError(file, i + 1, "frontmatter key is empty");
    }
    if (value === "") {
      throw new FrontmatterError(
        file,
        i + 1,
        `\`${key}\` has no value. Multi-line values, lists and anchors are not supported — keep it on one line.`
      );
    }
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key in meta) {
      throw new FrontmatterError(
        file,
        i + 1,
        `duplicate frontmatter key \`${key}\``
      );
    }
    meta[key] = value;
  }
  if (i >= lines.length) {
    throw new FrontmatterError(
      file,
      null,
      "frontmatter is not closed with `---`"
    );
  }
  return {
    meta,
    body: lines.slice(i + 1).join("\n"),
    bodyStartLine: i + 2,
  };
}
