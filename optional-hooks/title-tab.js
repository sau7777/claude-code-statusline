#!/usr/bin/env node
// Terminal Tab Profile - SessionStart / SessionEnd Hook (macOS Terminal)
//
// macOS Terminal builds its title bar out of several parts, and the title
// title-state.js sets is only one of them:
//
//   my-project — ✳ my-project · Op4.8:hg — caffeinate ◂ claude --resume 1f2e… — 211×73
//   └ working dir  └ the title we set     └ active process + arguments        └ dimensions
//
// "Working directory or document" and "Active process name/arguments" are not in
// Terminal's AppleScript dictionary — the similarly named `title displays file
// name` and `title displays shell path` are different options and do nothing here.
// What IS scriptable is the tab's whole profile, so this hook switches the tab to
// a profile that has those parts unchecked, and switches it back when the session
// ends. Dimensions have their own per-tab property, so those are turned off
// directly. Nothing outside this tab changes, and a closed tab forgets all of it.
//
// Setup: duplicate your usual profile in Terminal's settings, name it (default
// "Claude"), and under Window → Title uncheck "Working directory or document",
// "Active process name" and "Active process arguments". Duplicate the profile you
// actually use, or the tab's colors and font will change along with the title.
//
// Usage: node title-tab.js tidy ["Profile name"]   (SessionStart)
//        node title-tab.js restore                 (SessionEnd)

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

// Only Apple's Terminal has these properties; every other terminal composes its
// title differently and is left alone.
if (process.platform !== 'darwin' || process.env.TERM_PROGRAM !== 'Apple_Terminal') {
  process.exit(0);
}

const restoring = process.argv[2] === 'restore';
const profile = process.argv[3] || 'Claude';

// Claude Code spawns hooks without a controlling terminal, so the tty has to come
// from an ancestor: walk up until a process reports a real one.
function ancestorTty(pid) {
  for (let i = 0; i < 6 && pid > 1; i++) {
    let line;
    try {
      line = execFileSync('ps', ['-o', 'tty=,ppid=', '-p', String(pid)],
        { encoding: 'utf8', timeout: 5000 }).trim();
    } catch (e) {
      return null;
    }
    const [tty, ppid] = line.split(/\s+/);
    if (tty && tty !== '??') return tty;
    pid = Number(ppid);
  }
  return null;
}

function osa(script) {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 }).trim();
}

// Both names are interpolated into an AppleScript string literal, so accept only
// the shapes ps and Terminal are expected to produce and bail on anything else
// rather than trying to quote it.
const tty = ancestorTty(process.ppid);
if (!tty || !/^[A-Za-z0-9/]+$/.test(tty)) process.exit(0);
if (!/^[A-Za-z0-9 ._-]{1,64}$/.test(profile)) process.exit(0);

// Keyed by tty, not by session id: the setting belongs to the tab, and the
// restoring hook runs for whatever session is leaving that tab.
const statePath = path.join(os.tmpdir(), `claude-title-profile-${tty.replace(/\//g, '-')}`);
const match = (body) => `tell application "Terminal"
  repeat with w in windows
    repeat with t in tabs of w
      if tty of t is "/dev/${tty}" then
${body}
      end if
    end repeat
  end repeat
  return ""
end tell`;

try {
  if (restoring) {
    let previous = '';
    try {
      previous = fs.readFileSync(statePath, 'utf8').trim();
    } catch (e) {}
    if (!previous || !/^[A-Za-z0-9 ._-]{1,64}$/.test(previous)) process.exit(0);
    osa(match(`        set current settings of t to settings set "${previous}"`));
    try {
      fs.unlinkSync(statePath);
    } catch (e) {}
  } else {
    const previous = osa(match(`        set prev to name of current settings of t
        set current settings of t to settings set "${profile}"
        set title displays window size of t to false
        return prev`));
    // A session killed outright never restores, so the next one would find the
    // tab already switched. Remember only a genuine previous profile, keeping an
    // older record if there is one.
    if (previous && previous !== profile) fs.writeFileSync(statePath, previous);
  }
} catch (e) {}
