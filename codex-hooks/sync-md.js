#!/usr/bin/env node
// Codex PostToolUse hook: mirrors AGENTS.md edits into CLAUDE.md and GEMINI.md.
// Codex reports apply_patch input as tool_input.command, so the hook checks the
// patch text and only acts when a root AGENTS.md was touched. Never blocks.

const fs = require('fs');
const path = require('path');

const SYNC_LINE_RE = /^> \*\*(?:Синхронизация|Sync):\*\*.*$/m;
const SYNC_CLAUDE = '> **Sync:** Any changes to this file must also be applied to `AGENTS.md` and `GEMINI.md`.';
const SYNC_GEMINI = '> **Sync:** Any changes to this file must also be applied to `CLAUDE.md` and `AGENTS.md`.';

function patchTouchesRootAgents(command) {
  if (typeof command !== 'string') return false;
  return /(?:^|\n)\*\*\* (?:Add|Update|Delete) File: AGENTS\.md(?:\r?\n|$)/.test(command);
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    if (payload.tool_name !== 'apply_patch') process.exit(0);
    if (!patchTouchesRootAgents(payload.tool_input && payload.tool_input.command)) process.exit(0);

    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
    const agentsMd = path.join(cwd, 'AGENTS.md');
    const claudeMd = path.join(cwd, 'CLAUDE.md');
    const geminiMd = path.join(cwd, 'GEMINI.md');

    // First-time bootstrap stays manual and unrelated projects stay untouched.
    if (!fs.existsSync(agentsMd) || !fs.existsSync(claudeMd) || !fs.existsSync(geminiMd)) {
      process.exit(0);
    }

    const content = fs.readFileSync(agentsMd, 'utf8');
    fs.writeFileSync(claudeMd, content.replace(SYNC_LINE_RE, SYNC_CLAUDE), 'utf8');
    fs.writeFileSync(geminiMd, content.replace(SYNC_LINE_RE, SYNC_GEMINI), 'utf8');

    process.stdout.write(JSON.stringify({
      systemMessage: '✓ codex sync-md: AGENTS.md → CLAUDE.md + GEMINI.md',
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'The Codex sync-md hook regenerated CLAUDE.md and GEMINI.md from AGENTS.md.'
      }
    }));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`codex sync-md error: ${err.message}\n`);
    process.exit(0);
  }
});
