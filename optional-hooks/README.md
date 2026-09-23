# Optional Hooks

Five small Claude Code hooks that pair well with `statusline.js`. Each is
independent — install one, some, or all of them. None of them block your tools on
failure (they all `process.exit(0)` on any error).

| Hook | Event | Purpose |
|------|-------|---------|
| [`md-sync-check.js`](#md-sync-checkjs) | `SessionStart` | Warns Claude when `CLAUDE.md` ↔ `AGENTS.md` ↔ `GEMINI.md` drift apart |
| [`sync-md.js`](#sync-mdjs) | `PostToolUse` (Edit/Write/MultiEdit) | Auto-mirrors `CLAUDE.md` into `AGENTS.md` and `GEMINI.md` |
| [`github-sync-check.js`](#github-sync-checkjs) | `SessionStart` | Warns about uncommitted files and `origin` divergence |
| [`title-state.js`](#title-statejs) | `SessionStart` + `UserPromptSubmit` + `Stop` | Paints the terminal title with the launch dir, the model and a busy/idle glyph |
| [`title-tab.js`](#title-tabjs) | `SessionStart` + `SessionEnd` | Switches the session's tab to a Terminal profile that shows nothing but that title |

Recommended placement: drop the files directly into `~/.claude/hooks/` to keep
them alongside `statusline.js`. The examples below use that flat layout.

---

## `md-sync-check.js`

**What it does.** Reads the three sibling files (`CLAUDE.md`, `AGENTS.md`,
`GEMINI.md`) at session start, normalizes line endings and the per-file `Sync:`
line, then compares both line count and content. On drift, it emits an
`additionalContext` block that surfaces inside Claude's session-start system
reminder — so the agent itself sees the warning and can act on it.

**No-op when safe.** If any of the three files is missing, the hook exits silently.
This means it never warns about projects that don't use the synced-trio convention.

**Install.**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/md-sync-check.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

---

## `sync-md.js`

**What it does.** Watches for `Edit`, `Write`, or `MultiEdit` calls on any file
named `CLAUDE.md`. When one fires, it copies the new content into `AGENTS.md` and
`GEMINI.md` in the same directory, swapping the `Sync:` line so each file references
its two siblings correctly. Surfaces `✓ sync-md: CLAUDE.md → AGENTS.md + GEMINI.md`
as a visible system message after a successful sync.

**Safety.** Only fires when **both** `AGENTS.md` and `GEMINI.md` already exist next
to the edited `CLAUDE.md` — projects that don't use the trio are untouched.

**Pairs with `md-sync-check.js`** — that one *detects* drift, this one *prevents*
it. With both installed, you edit `CLAUDE.md` and the other two stay in sync forever.

**Install.**

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/sync-md.js\"",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

---

## `github-sync-check.js`

**What it does.** On session start, surfaces three classes of warnings so you don't
sleepwalk into a dirty merge:

- 🟡 **Uncommitted changes** — count of files with local modifications
- 🟡 **Behind `origin`** — local branch trails the remote (suggests `git pull`)
- 🟡 **Ahead of `origin`** — local has unpushed commits (suggests `git push`)
- 🔴 **Diverged** — both ahead and behind, requires merge or rebase

Warnings are written to **both** stderr (visible in your terminal) and the agent's
system reminder via `additionalContext` (so Claude sees them too).

**How it stays fast.** The session-start check is purely local — no network. After
emitting whatever the previous session cached, it spawns a *detached* background
process that runs `git fetch origin --quiet --no-tags` and writes the fresh
ahead/behind counts to `~/.claude/cache/github-sync.json`. The next time you start
a session, that fresh data is what shows up. So the warning you see is always one
session stale — but you pay zero startup cost for it.

**Skips silently** when:

- Not inside a git repo
- The remote isn't `github.com`
- You're in detached HEAD state

**Install.**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node \"/absolute/path/to/github-sync-check.js\"",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

---

## `title-state.js`

**What it does.** Paints the terminal window title as `<glyph> <launch dir> · <model>`:
`✳ my-project · Op4.8` when idle, `◐ my-project · Op4.8` while a turn runs.
The text half is composed by `statusline.js` — it is the one that knows the model
and the directory the session was launched from — and left in
`<tmpdir>/claude-title-text-<session_id>`. This hook adds the glyph for the event it
fired on and returns the finished escape as `terminalSequence`.

**Why the hook emits it and not the status line.** Claude Code spawns hooks and the
status line without a controlling terminal, so neither can open `/dev/tty`
(`Device not configured`) — a write there fails silently. `terminalSequence` hands
the escape back to Claude Code, which writes it from the terminal it owns. It
accepts OSC 0/1/2/9/99/777 and BEL only, so a title escape goes through as-is.

**Why it needs a companion setting.** Claude Code paints its own window title on
every state change and would overwrite this one. `CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1`
(see the install block) hands the title over. The cost is the animation: Claude Code
cycles its glyph every 960 ms, while a hook fires on events, so the working glyph
here stays on its first frame.

**On the three events.** `SessionStart` claims the title as soon as the session
opens (before the status line has rendered, it falls back to the working directory),
`UserPromptSubmit` switches to the working glyph, `Stop` returns to the idle one.
Install only the events you care about — each one is independent.

**A note on terminal settings.** macOS Terminal composes its title bar from
Settings → Profiles → Window → Title, and an escape-set title is only one of the
parts. With "Working directory" and "Active process name" checked you get
`my-project — ✳ my-project · Op4.8 — node`; uncheck them to see the title alone.

**Install.** The env var belongs in the same settings file:

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_TERMINAL_TITLE": "1"
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" idle" }
        ]
      }
    ],
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" busy" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" idle" }
        ]
      }
    ]
  }
}
```

---

## `title-tab.js`

**The problem it solves.** macOS Terminal builds its title bar out of several
parts, and the title `title-state.js` sets is only one of them:

```
my-project — ✳ my-project · Op4.8 — caffeinate ◂ claude --resume 1f2e… — 211×73
└ working dir  └ the title          └ active process + arguments         └ dimensions
```

**Why it switches profiles.** "Working directory or document" and "Active process
name/arguments" are not in Terminal's AppleScript dictionary. (`title displays file
name` and `title displays shell path` sound like them but are different options and
have no effect here — verified by reading the rendered `name of window` back after
setting them.) What *is* scriptable is the tab's whole profile, so this hook moves
the tab onto a profile with those parts unchecked and moves it back when the session
ends. Dimensions do have a per-tab property, so those are switched off directly.
Nothing outside the tab changes, and a closed tab forgets all of it.

**Setup (once).** In Terminal's settings duplicate the profile you actually use —
otherwise the tab's colors and font change along with the title — and name the copy
(`claude` below). Terminal has no "show the custom title" switch: an escape-set title
is always displayed, and the checkboxes only add more parts around it, so the setup
is all unchecking. Window and tab titles are composed separately, and both matter:

| In the profile | Uncheck | Key it writes |
|----------------|---------|---------------|
| Window → Title | Working directory or document | `ShowRepresentedURLInTitle` |
| Window → Title | Active process name (and arguments) | `ShowActiveProcessInTitle` |
| Tab → Title | Working directory or document | `ShowRepresentedURLInTabTitle` |
| Tab → Title | Active process name (and arguments) | `ShowActiveProcessInTabTitle` |
| Tab | Show activity indicator | `ShowActivityIndicatorInTab` |

The activity indicator is the easy one to miss: it leaves the title alone while the
window is in front, then replaces the tab's label with the running process a few
seconds after the window goes to the background, which reads as the title randomly
reverting. Verify with
`defaults read com.apple.Terminal "Window Settings"`. Pass the profile name to `tidy`.

**How it finds the tab.** Hooks are spawned without a controlling terminal, so it
walks up the process tree until an ancestor reports a real tty, then matches that
against `tty` of each tab. No Automation permission prompt: Terminal scripting
itself is not cross-application.

**Restoring.** The profile the tab had is remembered in
`<tmpdir>/claude-title-profile-<tty>` — keyed by tab, not by session, since that is
what the setting belongs to. A session that is killed outright never runs
`SessionEnd`, so the record is kept rather than overwritten when the next session
finds the tab already switched; the tab is restored whenever a session does end
cleanly, and closing it resets everything regardless.

**Scope.** Exits immediately unless `TERM_PROGRAM` is `Apple_Terminal` — iTerm2,
Ghostty, WezTerm and friends compose titles their own way and are left alone.

**Install.**

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-tab.js\" tidy claude" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-tab.js\" restore" }
        ]
      }
    ]
  }
}
```

---

## Combined snippet (all five + the statusline)

If you want everything wired up at once, here's the full block to merge into
`~/.claude/settings.json`:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node \"/absolute/path/to/statusline.js\"",
    "refreshInterval": 60
  },
  "env": {
    "CLAUDE_CODE_DISABLE_TERMINAL_TITLE": "1"
  },
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" busy" }
        ]
      }
    ],
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" idle" }
        ]
      }
    ],
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-state.js\" idle" },
          { "type": "command", "command": "node \"/absolute/path/to/title-tab.js\" tidy claude" },
          { "type": "command", "command": "node \"/absolute/path/to/github-sync-check.js\"", "timeout": 10 },
          { "type": "command", "command": "node \"/absolute/path/to/md-sync-check.js\"",      "timeout": 5  }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/title-tab.js\" restore" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [
          { "type": "command", "command": "node \"/absolute/path/to/sync-md.js\"", "timeout": 5 }
        ]
      }
    ]
  }
}
```

Replace `/absolute/path/to/` with whatever you used (e.g. `C:/Users/you/.claude/hooks/`
on Windows). Restart Claude Code afterwards.
