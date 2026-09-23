#!/usr/bin/env node
// Terminal Title - SessionStart / UserPromptSubmit / Stop Hook
//
// Paints the terminal window title as "<glyph> <launch dir> · <model>", e.g.
// "✳ my-project · Op4.8:hg" when idle and "◐ my-project · Op4.8:hg" while a turn
// runs. The text half is composed by statusline.js, which knows the model and the
// launch directory, and left in <tmpdir>/claude-title-text-<session_id>; this hook
// adds the glyph for the event it fired on and returns the whole escape as
// `terminalSequence`, which Claude Code emits on our behalf.
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

// Same two glyphs Claude Code's own title uses: a spinner frame while it works,
// the idle mark otherwise. A hook fires on events rather than on a timer, so the
// working glyph stays on its first frame instead of animating.
const glyph = process.argv[2] === 'busy' ? '◐' : '✳';

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
    process.stdout.write(JSON.stringify({
      terminalSequence: `\x1b]0;${glyph} ${text}\x07`
    }));
  } catch (e) {}
});
