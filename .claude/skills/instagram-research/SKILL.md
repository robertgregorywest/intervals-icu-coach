---
name: instagram-research
description: Download all images + caption from a public Instagram post so the model can read them. Use whenever the user pastes an instagram.com/p/<shortcode>/ URL and asks for analysis, summary, or to fold insights into the project. WebFetch cannot read Instagram (auth wall); this skill is the only reliable path.
---

# instagram-research

User regularly shares Instagram posts with cycling/coaching insights (e.g. @knowledgeiswatt, @inscyd). Instagram blocks unauthenticated HTTP, so `WebFetch` returns nothing useful — captions and carousel images both need a real download. This skill is the workflow.

## When to invoke

The user message contains an `instagram.com/p/<shortcode>/` URL **and** asks for analysis, reading, or integration into the project. If the user is just sharing a link without asking for analysis, ask first.

## Setup

Needs `gallery-dl` and `jq`, plus a logged-in Instagram cookie — anonymous requests get a login redirect, then `429 Too Many Requests`.

- **Laptop:** `brew install gallery-dl jq`. Cookies come from Chrome (`--cookies-from-browser chrome`).
- **Cloud session** (`CLAUDE_CODE_REMOTE=true`): no browser, so the cookie comes from the `INSTAGRAM_SESSIONID` environment variable — the value of the `sessionid` cookie for instagram.com, copied from Chrome DevTools → Application → Cookies and stored in the cloud environment's settings. Never ask the user to paste it into chat. Run this once per session before the command:

  ```bash
  command -v gallery-dl >/dev/null || uv tool install gallery-dl || pip install --user gallery-dl
  [ -n "${INSTAGRAM_SESSIONID:-}" ] || echo "INSTAGRAM_SESSIONID is not set — stop and ask the user to add it to the environment"
  mkdir -p ~/.config/gallery-dl && chmod 700 ~/.config/gallery-dl
  printf '# Netscape HTTP Cookie File\n.instagram.com\tTRUE\t/\tTRUE\t0\tsessionid\t%s\n' \
    "$INSTAGRAM_SESSIONID" > ~/.config/gallery-dl/instagram-cookies.txt
  ```

  Then use `COOKIES=(--cookies ~/.config/gallery-dl/instagram-cookies.txt)` in the command below. If `INSTAGRAM_SESSIONID` is missing, stop and tell the user — don't fall back to `WebFetch`.

## The command

```bash
SC=<shortcode>   # the path segment after /p/ in the URL
COOKIES=(--cookies-from-browser chrome)   # cloud: see Setup
mkdir -p docs/personal/instagram/$SC
gallery-dl -D docs/personal/instagram/$SC --write-metadata \
  "${COOKIES[@]}" \
  "https://www.instagram.com/p/$SC/"
```

Output layout (one JSON sidecar per image):

```
docs/personal/instagram/<shortcode>/
  <id>_<media_id_1>.jpg
  <id>_<media_id_1>.jpg.json
  <id>_<media_id_2>.jpg
  ...
```

The directory `docs/personal/` is already gitignored — downloads stay local.

## After download

Use **absolute paths** for everything below — see the "do not cd" note in _What not to do_.

1. **Order the slides and grab the caption in one shot** with `jq` (always pass absolute paths, never `cd` into the directory first):

   ```bash
   DIR=/abs/path/to/repo/docs/personal/instagram/$SC
   jq -r '[.num, input_filename] | @tsv' "$DIR"/*.json | sort -n
   jq -r '.description' "$DIR"/*.json | head -1
   ```

   The first command prints `num<TAB>path` so you can read images in slide order. The second prints the caption (identical across sidecars in a carousel).

2. **Read each image in slide order** with the `Read` tool (multimodal). Transcribe the substantive text and describe any charts/diagrams before summarising.
3. **Cite sources visible on the slides** (e.g. "Vaccari et al. 2020", "Odden et al. 2024") so the user can verify the underlying paper before you change project code.

## Cookie troubleshooting

In the cloud, a login redirect means `INSTAGRAM_SESSIONID` has expired — ask the user to copy a fresh `sessionid` into the environment settings and start a new session.

On the laptop, `gallery-dl --cookies-from-browser chrome` reads Chrome's encrypted cookie DB on macOS. Two failure modes:

1. **HTTP redirect to login** — your stored cookies are stale or expired. Open Chrome, visit instagram.com, confirm you're logged in, retry.
2. **Command hangs with no output** — Chrome is running and has the cookie DB locked. Ask the user to fully quit Chrome (Cmd+Q, not just close window) and retry.

If both fail, fall back to a manual `cookies.txt`: install a "Get cookies.txt LOCALLY" Chrome extension, export instagram.com cookies, save to `~/.config/gallery-dl/instagram-cookies.txt`, then swap `--cookies-from-browser chrome` for `--cookies ~/.config/gallery-dl/instagram-cookies.txt`. This path also works while Chrome is open.

## What not to do

- **Do not** `WebFetch` the Instagram URL — it returns "[Content truncated due to length...]" or a login redirect. Wastes a turn.
- **Do not** `cd` into the download directory in a Bash call. The Bash tool persists CWD across calls, so a `cd` in one command silently breaks every later command that uses repo-relative paths. Pass absolute paths to `jq`, `ls`, etc. instead.
- **Do not** reach for inline `python3 -c '...json.load...'` to inspect sidecars — `jq` is shorter, and for whole-file reads the `Read` tool handles JSON fine.
- **Do not** guess slide content from the URL shortcode or the user's hint. Read the actual images.
- **Do not** check downloaded images into git. `docs/personal/` is gitignored; keep it that way.
- **Do not** auto-propose code changes from a single post. Summarise the insight, cite the paper(s), and ask the user before editing any project file beyond skill docs.
