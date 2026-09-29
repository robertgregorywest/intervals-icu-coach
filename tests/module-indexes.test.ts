import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// ADR 0014: a module's index exports its interface, its factory, the types that
// interface uses and the constants its input contract names — nothing else. No
// concrete class, no helper, no error class, no second factory. Types vanish at
// runtime, so what is left to check is the values: the one function must be a
// `createX` factory (a class is a function too, so this catches classes), and
// anything else must be a primitive constant.

const servicesDir = fileURLToPath(new URL("../src/services/", import.meta.url));
const modules = readdirSync(servicesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

describe("module indexes", () => {
  it("finds the modules", () => {
    expect(modules.length).toBeGreaterThan(10);
  });

  it.each(modules)(
    "%s exports one factory and contract constants",
    async (name) => {
      const index = (await import(
        /* @vite-ignore */ `${servicesDir}${name}/index.ts`
      )) as Record<string, unknown>;
      const breaches = Object.entries(index)
        .filter(([key, value]) =>
          typeof value === "function"
            ? !/^create[A-Z]/.test(key) || /^\s*class\b/.test(String(value))
            : typeof value === "object" && value !== null
        )
        .map(([key]) => key);
      expect(breaches).toEqual([]);
      expect(
        Object.keys(index).filter((k) => /^create[A-Z]/.test(k))
      ).toHaveLength(1);
    }
  );
});
