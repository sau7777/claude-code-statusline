#!/usr/bin/env node
// Terminal Title - SessionStart / UserPromptSubmit / Stop Hook
//
// Paints the terminal window title as "<glyph> <launch dir> · <model>", e.g.
// "✳ my-project · Op4.8:hg" when idle, "◐ my-project · Op4.8:hg" while a turn runs
// and "◆ my-project · Op4.8:hg" when the turn is over but background work it
// started is still running. The text half is composed by statusline.js, which
// knows the model and the launch directory, and left in
// <tmpdir>/claude-title-text-<session_id>; this hook adds the glyph for the
// event it fired on and returns the whole escape as `terminalSequence`, which
// Claude Code emits on our behalf.
//
// Why not write the escape directly: hooks and the status line are both spawned
// without a controlling terminal, so /dev/tty cannot be opened from either.
// Claude Code writes it from the terminal it owns.
//
// Pair it with CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1, otherwise Claude Code's own
// title writer repaints over this one on every state change.
//
// Usage: node title-state.js busy   (UserPromptSubmit)
//        node title-state.js idle   (SessionStart, Stop)

const fs = require('fs');
const path = require('path');
const os = require('os');

// The first two are the glyphs Claude Code's own title uses: a spinner frame
// while it works, the idle mark otherwise. A hook fires on events rather than on
// a timer, so the working glyph stays on its first frame instead of animating.
// The third is ours, for a turn that ended with background work still in flight.
const BUSY = '◐';
const IDLE = '✳';
const WAIT = '◆';
const busy = process.argv[2] === 'busy';

let input = '';
const stdinTimeout = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  clearTimeout(stdinTimeout);
  try {
    const data = JSON.parse(input);
    const session = data.session_id || '';
    // Same guard statusline.js applies: the id becomes a filename, so an
    // unexpected shape is treated as absent rather than sanitized in place.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(session)) return;
    let text = '';
    try {
      text = fs.readFileSync(path.join(os.tmpdir(), `claude-title-text-${session}`), 'utf8').trim();
    } catch (e) {}
    // At SessionStart the status line may not have rendered yet. Fall back to the
    // working directory so the title never keeps showing the previous session.
    if (!text) text = path.basename(data.cwd || '') || 'Claude Code';
    // Stop hands the hook `background_tasks`: every running/pending row of the
    // session's task registry. Claude Code's own title paints that state as idle,
    // and telling the two apart is the whole point of the third glyph. Builds
    // without the field (it is in 2.1.302, the oldest one checked) read as
    // nothing in flight; so does any other shape.
    //
    // Not every row is work the session is waiting on. A published artifact the
    // session watches is a `monitor` row ("live updates for artifact <url>") that
    // runs until the session ends, one per artifact, and counting those pins the
    // glyph on for good. So only the kinds that finish on their own are counted,
    // by the friendly `type` label. Anything else stays uncounted, future kinds
    // included: a quiet title beats a stuck one.
    const WAKES_THE_SESSION = new Set(['shell', 'subagent', 'workflow', 'MCP task']);
    const tasks = Array.isArray(data.background_tasks) ? data.background_tasks : [];
    const waiting = tasks.some(t => t && WAKES_THE_SESSION.has(t.type));
    const glyph = busy ? BUSY : waiting ? WAIT : IDLE;
    process.stdout.write(JSON.stringify({
      terminalSequence: `\x1b]0;${glyph} ${text}\x07`
    }));
  } catch (e) {}
});
