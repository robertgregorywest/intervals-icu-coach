---
name: release
description: Cut a new release of intervals-icu-coach: bump versions in package.json and manifest.json, commit, tag, and push to trigger the GitHub Actions release workflow. Use when user asks to release, ship, or create a new version.
---

# Release

## Steps

- [ ] Verify `manifest.json` `tools[]` matches what the server registers (see check below)
- [ ] Bump `version` in `package.json`
- [ ] Bump `version` in `manifest.json` to match
- [ ] Commit: `git add package.json manifest.json && git commit -m "chore: release vX.Y.Z"`
- [ ] Tag and push: `git tag vX.Y.Z && git push && git push --tags`

Pushing the tag triggers the GitHub Actions workflow, which handles build, test, pack, clean, and GitHub Release creation.

## Manifest staleness check

The manifest's `tools[]` array must match what the server actually registers — it's how Claude Desktop's UI advertises capabilities. Drift here doesn't break the server (the live tool list comes from `tools/list` over MCP), but it does break discoverability for users browsing the bundle.

Run before bumping versions:

```bash
npm run check:manifest
```

This compares the tool registry (`src/registry.ts`) against `manifest.json` and exits non-zero on drift (`scripts/check-manifest.ts`). The logic lives in a committed script rather than inline shell so it's a single stable command — allowlist `Bash(npm run check:manifest)` to skip the permission prompt.

If something's missing from the manifest, add it before tagging. Each `tools[]` entry is `{ "name": "..." }` (validated by `npx mcpb validate manifest.json`).

## MCPB / Claude Desktop Gotchas

- Claude Desktop uses its own **built-in Node.js** (not system Node) and runs with **CWD=`/`**
- `mcp_config.args` in `manifest.json` **must** use `${__dirname}` — bare relative paths won't resolve
- **Never use `console.log`** in the stdio server — corrupts the JSON-RPC transport; use `console.error`
- Manifest env vars use `${user_config.key}` syntax (not `{{key}}`)
