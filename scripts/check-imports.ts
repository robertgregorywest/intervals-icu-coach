#!/usr/bin/env tsx
// Every module under src/services/ is used through its index.ts — ADR 0014.
// Fails when code outside a module imports any other file of it. Inside the
// module, and in that module's own tests (tests/services/<module>/ or
// tests/services/<module>.test.ts), its internals are fair game. scripts/ is
// not checked: its probes reach into internals on purpose.
//
// Also fails when a file in src/shared/ imports anything outside src/shared/:
// the shared domain primitives are a leaf, below every module.
//
// A regex over the source, not the compiler: it catches `from "..."`,
// `import "..."` and `import("...")` with a relative specifier, which is every
// import this repo writes. Like check-manifest, it refuses to pass having
// scanned nothing, so it cannot rot into a no-op.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve, sep } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCANNED = ["src", "tests", "evals"];
const IMPORT = /\b(?:from|import)\s*\(?\s*["'](\.{1,2}\/[^"']*)["']/g;
const MODULE_FILE = /^src\/services\/([^/]+)\/(.+)$/;
const SHARED = "src/shared/";

function tsFiles(dir: string): string[] {
  return readdirSync(resolve(root, dir), { recursive: true, encoding: "utf8" })
    .map((f) => join(dir, f).split(sep).join("/"))
    .filter((f) => /\.m?ts$/.test(f) && !f.includes("node_modules/"));
}

function mayReachInto(importer: string, module: string): boolean {
  return (
    importer.startsWith(`src/services/${module}/`) ||
    importer.startsWith(`tests/services/${module}/`) ||
    importer === `tests/services/${module}.test.ts`
  );
}

const files = SCANNED.flatMap(tsFiles);
if (files.length === 0) {
  console.error("check-imports: scanned no files — the check is broken.");
  process.exit(1);
}

const breaches: string[] = [];
for (const file of files) {
  const source = readFileSync(resolve(root, file), "utf8");
  for (const match of source.matchAll(IMPORT)) {
    const target = relative(root, resolve(root, dirname(file), match[1]))
      .split(sep)
      .join("/");
    const line = () => source.slice(0, match.index).split("\n").length;
    if (file.startsWith(SHARED) && !target.startsWith(SHARED)) {
      breaches.push(
        `${file}:${line()} imports ${match[1]} — src/shared/ imports only src/shared/`
      );
      continue;
    }
    const m = MODULE_FILE.exec(target);
    if (!m || /^index(\.[mc]?[jt]s)?$/.test(m[2])) continue;
    if (mayReachInto(file, m[1])) continue;
    breaches.push(`${file}:${line()} imports ${match[1]}`);
  }
}

if (breaches.length > 0) {
  console.error(
    "Import a module only through its index.ts, and keep src/shared/ a leaf (docs/adr/0014-modules-behind-interfaces.md):"
  );
  for (const b of breaches) console.error(`  ${b}`);
  process.exit(1);
}
console.log(`check-imports: ${files.length} files, no deep imports.`);
