// Mutation testing, on demand: `npm run mutate`, or narrow it with
// `npm run mutate -- --mutate "src/shared/**/*.ts"`. Not in the hook — a full
// sweep takes far longer than the suite.
//
// No @stryker-mutator/typescript-checker: it needs the classic compiler API,
// which TypeScript 7 doesn't ship. Some survivors may be mutants tsc would
// have rejected; read them before writing a test for them.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
export default {
  testRunner: "vitest",
  vitest: { configFile: "vitest.config.ts" },
  // The domain logic. The adapters and the cassette mutate into log strings
  // and wire formatting, which is noise.
  mutate: ["src/services/**/*.ts", "src/shared/**/*.ts"],
  // Stryker rewrites the tsconfig through the same missing API to fix paths
  // that leave the sandbox. Ours point nowhere outside the repo, so name a
  // file that doesn't exist and the rewrite is skipped.
  tsconfigFile: "no-tsconfig-rewrite.json",
  coverageAnalysis: "perTest",
  incremental: true,
  incrementalFile: "reports/stryker-incremental.json",
  reporters: ["clear-text", "progress", "html"],
  htmlReporter: { fileName: "reports/mutation/mutation.html" },
  // Report-only until a baseline sets a floor.
  thresholds: { high: 80, low: 60, break: null },
};
