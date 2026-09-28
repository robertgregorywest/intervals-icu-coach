# Sandcastle setup

`npm run sandcastle` drives the three-phase planner→implementer→merger loop in
`.sandcastle/main.ts` against open GitHub Issues labelled `sandcastle`. Each
agent runs inside a Docker container built from `.sandcastle/Dockerfile`, with
the repo bind-mounted at `/home/agent/workspace`.

This document covers cross-platform setup. Most of the workflow is identical on
macOS, native Linux, and WSL — the differences live in the
[Environment-specific notes](#environment-specific-notes) section below.

## Prerequisites

| Thing              | Requirement                                                           |
| ------------------ | --------------------------------------------------------------------- |
| Node               | ≥ 20 (project develops on 22+)                                        |
| Docker             | A reachable Linux-container daemon (Docker Desktop, Podman, etc.)     |
| Repo checkout      | Native filesystem of the OS that runs the Docker CLI (see below)      |
| `.sandcastle/.env` | `CLAUDE_CODE_OAUTH_TOKEN` **or** `ANTHROPIC_API_KEY`, plus `GH_TOKEN` |

The sandcastle container installs its own `gh` and Claude CLI (see
`.sandcastle/Dockerfile`), so the host needs neither.

## Getting started

```bash
cd <your-checkout>
npm install                      # first time, or after dependency changes
npx @ai-hero/sandcastle docker build-image   # optional: pre-build the sandbox image
npm run sandcastle
```

The first `npm run sandcastle` will build the image on demand if you skipped the
pre-build step. Pre-building is recommended on a fresh machine because it
validates Docker connectivity and the Dockerfile end-to-end without spending any
API tokens.

A full run spawns an Opus planner plus parallel implementer agents — it spends
real tokens, runs for a while, and creates branches/commits. Logs stream to
`.sandcastle/logs/` (e.g. `tail -f .sandcastle/logs/main-planner.log`).

### `.sandcastle/.env`

Copy from the example and fill in:

```bash
cp .sandcastle/.env.example .sandcastle/.env
```

For Claude auth set **`CLAUDE_CODE_OAUTH_TOKEN`** (generate with
`claude setup-token` — a `sk-ant-oat01-…` subscription token) **or**
`ANTHROPIC_API_KEY` (a `sk-ant-api03-…` console key), not both. Also set a
GitHub `GH_TOKEN` (Issues: read/write, Metadata: read). Sandcastle's
`EnvResolver` forwards every key declared in this file into the sandbox
container.

## Environment-specific notes

Sandcastle's docker provider derives its bind-mount from `process.cwd()` and
hands it straight to the Docker daemon. Everything below comes down to keeping
that path resolvable by the daemon that will run the container.

### macOS (Docker Desktop)

Just works. Docker Desktop runs a Linux VM, but its CLI handles host→VM path
translation for bind-mounts transparently. The `:z` SELinux suffix that
sandcastle appends by default is a no-op on Docker Desktop.

UID/GID alignment is handled automatically: `sandcastle docker build-image`
passes `--build-arg AGENT_UID=$(id -u) AGENT_GID=$(id -g)` so files the
container writes to the bind-mount land owned by your host user.

### Native Linux

Same as macOS. On SELinux-enforcing distros (Fedora, RHEL, CentOS Stream) the
default `:z` suffix is meaningful and correct — it relabels the mount as a
shared SELinux context so the container can read/write it.

### WSL with a Linux-hosted Docker daemon

This is the setup on the other machine (`AER-OXF-DEV-RWE`, WSL distro
`aurora_wsl`). The Docker daemon there is **not** Docker Desktop — it's a Linux
daemon running inside the `aurora_wsl` distro, reached by the Windows
`docker.exe` over `tcp://docker.local:2375` with **no path translation**.

In that topology, `npm run sandcastle` **must run inside the distro**, against a
checkout on the distro's native ext4 filesystem. Run it from PowerShell and
`process.cwd()` will be a Windows path (`C:/GitHub/...`) that the Linux daemon
can't resolve; sandcastle's default `:z` mount suffix then makes the failure
worse by giving the Linux volume parser a malformed spec:

```
docker: Error response from daemon: invalid volume specification:
'C:/GitHub/.../intervals-icu-coach:/home/agent/workspace:z'
```

Run from inside WSL and `process.cwd()` becomes a native Linux path the daemon
mounts cleanly; `:z` becomes a harmless no-op (WSL2's kernel doesn't enforce
SELinux). **No code change is needed** — leave `selinuxLabel` at its default in
`.sandcastle/main.ts`.

Reference layout for that machine:

| Thing          | Value                                                        |
| -------------- | ------------------------------------------------------------ |
| WSL distro     | `aurora_wsl` (hostname `AER-OXF-DEV-RWE`)                    |
| Repo (primary) | `~/personal/intervals-icu-coach` on the distro's native ext4 |
| Docker         | Linux daemon in `aurora_wsl`, reached via local socket       |
| `DOCKER_HOST`  | unset inside the distro (uses the socket — leave it unset)   |
| Node           | v22 at `~/.local/node` (per-user, no sudo)                   |

`~/.local/node/bin` is prepended to `PATH` in both `~/.bashrc` and `~/.profile`,
so login terminals use this Node rather than the Windows `fnm`/`nvm` install
that leaks onto `PATH` via `/mnt/c`.

#### Editing with VS Code on WSL

Use the **WSL** extension (`ms-vscode-remote.remote-wsl`) so VS Code edits the
native Linux files directly:

```bash
cd ~/personal/intervals-icu-coach
code .             # opens a "[WSL: aurora_wsl]" window
```

The integrated terminal opens inside the distro, so `npm run sandcastle` just
works. Avoid opening the repo via the `\\wsl.localhost\aurora_wsl\...` UNC path
as a plain Windows folder — that runs the extension host and terminal
Windows-side over 9p (slow, and the terminal isn't in the distro).

## Recreating on a fresh machine

### macOS / native Linux

1. Install **Docker Desktop** (macOS) or your distro's Docker / Podman package.
   Confirm reachability: `docker info --format '{{.Name}} {{.OSType}}'` should
   print `<host> linux`.
2. Install **Node ≥ 20** (Homebrew `node`, `nvm`, `fnm`, distro package, etc.).
3. **Clone** the repo wherever you keep work; the path doesn't matter as long
   as the Docker daemon can see it (Docker Desktop and native Linux daemons
   both can).
4. `npm install`
5. Create `.sandcastle/.env` from the example and fill in the tokens (see
   [`.sandcastle/.env`](#sandcastleenv) above).
6. `npx @ai-hero/sandcastle docker build-image` to validate the Dockerfile.

### WSL with a Linux-hosted daemon

1. **Install a Linux Node (≥ 20)** in the distro, no sudo required:
   ```bash
   ver=$(curl -fsSL https://nodejs.org/dist/index.json \
     | grep -oE '"version":"v22[0-9.]+"' | head -1 | cut -d'"' -f4)
   mkdir -p ~/.local/node
   curl -fsSL "https://nodejs.org/dist/$ver/node-$ver-linux-x64.tar.xz" \
     | tar -xJ -C ~/.local/node --strip-components=1
   # prepend to PATH for login + interactive shells
   for f in ~/.bashrc ~/.profile; do
     grep -q '.local/node/bin' "$f" 2>/dev/null \
       || echo 'export PATH="$HOME/.local/node/bin:$PATH"' >> "$f"
   done
   ```
2. **Clone the repo into the native filesystem** (not `/mnt/c`). The
   `github.com-personal` host below is an SSH alias from the multi-account git
   setup (`~/.ssh/config` + per-directory `~/.gitconfig` `includeIf`); it
   selects the personal key so this repo authenticates and commits as the
   personal account. Substitute a plain `git@github.com:` / HTTPS URL if you
   haven't set that up.
   ```bash
   mkdir -p ~/personal
   git clone git@github.com-personal:robertgregorywest/intervals-icu-coach.git \
     ~/personal/intervals-icu-coach
   cd ~/personal/intervals-icu-coach && npm install
   ```
3. Create `.sandcastle/.env` from the example and fill in the tokens.
4. **Verify** the daemon is reachable from the distro:
   ```bash
   docker info --format '{{.Name}} {{.OSType}}'   # expect: <host> linux
   ```

## Troubleshooting

- **`invalid volume specification ... :z`** — you're running from a host whose
  path format the Docker daemon doesn't understand. On WSL with a Linux-hosted
  daemon, `cd ~/personal/intervals-icu-coach` inside the distro and re-run. On
  macOS / native Linux this shouldn't happen with the default config.
- **`npm` resolves to a Windows version (wrong number)** _(WSL only)_ — your
  shell picked up the leaked Windows Node via `/mnt/c`. Confirm
  `command -v node` points at `~/.local/node/bin/node`; if not, ensure the
  `PATH` line is in `~/.profile` and start a fresh login shell.
- **Docker unreachable** — on WSL, check `DOCKER_HOST` is unset inside the
  distro so the CLI uses the local socket. On macOS, confirm Docker Desktop is
  running. On native Linux, confirm your user is in the `docker` group (or use
  rootless Podman).
- **`Invalid API key · Fix external API key`** (agent exits code 1) — you put a
  subscription OAuth token (`sk-ant-oat01-…`) in `ANTHROPIC_API_KEY`. The
  Claude CLI sends that as an `x-api-key`, which the API rejects
  (`invalid x-api-key`). Move the value to `CLAUDE_CODE_OAUTH_TOKEN` and remove
  the `ANTHROPIC_API_KEY` line. Only `sk-ant-api03-…` console keys belong in
  `ANTHROPIC_API_KEY`.
- **File-ownership mismatch on the host after a run** _(native Linux)_ — make
  sure you ran `sandcastle docker build-image` as the host user that will
  invoke `npm run sandcastle`, so `AGENT_UID`/`AGENT_GID` match. Rebuilding the
  image fixes it.
