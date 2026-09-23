# Codex CLI variant

This directory provides the Codex counterpart to the Claude Code hooks in
`optional-hooks/`. It uses Codex's native status line and lifecycle hook APIs;
it does not modify or replace `statusline.js`.

| File | Event / config | Purpose |
|------|----------------|---------|
| `config.toml.example` | `[tui].status_line` | Selects Codex's built-in footer items |
| `md-sync-check.js` | `SessionStart` | Warns when the AGENTS/CLAUDE/GEMINI trio has drifted |
| `sync-md.js` | `PostToolUse` (`apply_patch`) | Mirrors root `AGENTS.md` into its two siblings |
| `github-sync-check.js` | `SessionStart` | Reports dirty files and cached `origin` divergence |

All scripts use only built-in Node.js modules and exit `0` on errors.

## Status line

Merge the contents of `config.toml.example` into `~/.codex/config.toml`, then
restart Codex. You can also run `/statusline` in the Codex TUI to select items
interactively.

Codex currently accepts a fixed list of built-in items. It cannot invoke this
repository's `statusline.js`, accept arbitrary ANSI output, or add custom
segments such as `md drift` and detailed git buckets. Unknown or unavailable
items are omitted by the TUI.

## Hooks

Copy `hooks.json.example` to one of these locations:

- `~/.codex/hooks.json` for all repositories; or
- `<repo>/.codex/hooks.json` for a trusted repository only.

Replace every `/absolute/path/to/` occurrence with the path to this repository.
On Windows, use forward slashes in JSON paths, for example
`C:/Users/you/statusline/codex-hooks/sync-md.js`.

Codex asks you to review and trust non-managed command hooks before running
them. Start a new Codex session after installing or changing the file.

## Markdown sync direction

The Codex variant treats `AGENTS.md` as canonical:

```text
AGENTS.md -> CLAUDE.md + GEMINI.md
```

`sync-md.js` runs only after Codex edits the root `AGENTS.md` through
`apply_patch`, and only if all three files already exist. The first-time
bootstrap is therefore manual. Direct edits made by an editor, another process,
or a shell command are detected on the next session by `md-sync-check.js`, but
are not automatically mirrored.

The Claude hook remains independent and uses the opposite direction
(`CLAUDE.md` as canonical). Do not enable both auto-sync hooks in the same agent
session unless you deliberately want that last-writer-wins behavior.

## Git check

The startup hot path performs local git commands only. It reports uncommitted
files and reads the previous run's cached ahead/behind counts. A detached child
then runs `git fetch origin --quiet --no-tags` and stores fresh counts in
`$CODEX_HOME/cache/github-sync.json` (normally `~/.codex/cache/`) for the next
session.

Unlike the Claude hook, this variant works with any `origin` URL, not only
GitHub. It skips non-git directories, missing remotes, and detached HEAD.

## Test

```bash
node tests/codex-hooks-smoke.test.js
```
