import { describe, it, expect } from "vitest";
import {
  FrontmatterError,
  parseFrontmatter,
} from "../../src/shared/frontmatter.js";

const parse = (source: string) => parseFrontmatter(source, "t.md");

/** The error a source throws, so its line and message can both be read. */
function errorOf(source: string): FrontmatterError {
  try {
    parse(source);
  } catch (err) {
    if (err instanceof FrontmatterError) return err;
    throw err;
  }
  throw new Error("parsed without error");
}

describe("parseFrontmatter — what it reads", () => {
  it("splits meta from body and says where the body starts", () => {
    const result = parse("---\nid: vo2-4x4\nsport: Ride\n---\n- 4m 95%\n");
    expect(result).toEqual({
      meta: { id: "vo2-4x4", sport: "Ride" },
      body: "- 4m 95%\n",
      bodyStartLine: 5,
    });
  });

  it("splits on the first colon, so a value may hold one", () => {
    expect(parse("---\nfolder: Coach: VO2 Max\n---\n").meta).toEqual({
      folder: "Coach: VO2 Max",
    });
  });

  it("trims keys and values, and skips blank lines", () => {
    expect(parse("--- \n  name :  Openers  \n\n   \n---\n").meta).toEqual({
      name: "Openers",
    });
  });

  it("strips one pair of matching quotes, double or single", () => {
    expect(parse("---\na: \"x: y\"\nb: 'z'\n---\n").meta).toEqual({
      a: "x: y",
      b: "z",
    });
  });

  it("keeps a quote that is unpaired or alone", () => {
    const { meta } = parse(
      "---\na: \"open\nb: 'open\nc: close\"\nd: close'\ne: \"\nf: '\n---\n"
    );
    expect(meta).toEqual({
      a: '"open',
      b: "'open",
      c: 'close"',
      d: "close'",
      e: '"',
      f: "'",
    });
  });

  it("reads CRLF line endings", () => {
    expect(parse("---\r\nid: x\r\n---\r\nbody").meta).toEqual({ id: "x" });
  });

  it("closes on a fence with surrounding whitespace", () => {
    expect(parse("---\nid: x\n  ---  \nbody").body).toBe("body");
  });
});

describe("parseFrontmatter — what it refuses, and where", () => {
  it.each([
    ["no opening fence", "id: x\n---\n", 1, /must start with a `---`/],
    ["an empty source", "", 1, /must start with a `---`/],
    [
      "a line with no colon",
      "---\nid: x\njust words\n---\n",
      3,
      /no colon: "just words"\. Values must be a single line of `key: value`\./,
    ],
    ["an empty key", "---\n: x\n---\n", 2, /key is empty/],
    [
      "a multi-line value",
      "---\nsteps:\n  - a\n---\n",
      2,
      /`steps` has no value/,
    ],
    ["a duplicate key", "---\nid: x\nid: y\n---\n", 3, /duplicate .*`id`/],
  ])("refuses %s", (_case, source, line, message) => {
    const err = errorOf(source);
    expect(err.line).toBe(line);
    expect(err.message).toMatch(message);
    expect(err.message).toMatch(new RegExp(`^t\\.md:${line} — `));
  });

  it("refuses an unclosed block, naming the file but no line", () => {
    const err = errorOf("---\nid: x\n");
    expect(err.line).toBeNull();
    expect(err.message).toBe("t.md — frontmatter is not closed with `---`");
    expect(err.name).toBe("FrontmatterError");
  });
});
