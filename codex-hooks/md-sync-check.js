#!/usr/bin/env node
// Codex SessionStart hook: verifies AGENTS.md, CLAUDE.md and GEMINI.md
// are in sync after stripping the per-file Sync: line. Silent no-op in
// projects without the trio. Never blocks; exits 0 on any error.

const fs = require('fs');
const path = require('path');

const SYNC_LINE_RE = /^> \*\*(?:Синхронизация|Sync):\*\*.*$/m;

function readNormalized(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').replace(/\r\n/g, '\n');
  } catch {
    return null;
  }
}

function countLines(text) {
  if (text.length === 0) return 0;
  const count = text.split('\n').length;
  return text.endsWith('\n') ? count - 1 : count;
}

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
    const repoName = path.basename(cwd);
    const agents = readNormalized(path.join(cwd, 'AGENTS.md'));
    const claude = readNormalized(path.join(cwd, 'CLAUDE.md'));
    const gemini = readNormalized(path.join(cwd, 'GEMINI.md'));

    if (agents === null || claude === null || gemini === null) process.exit(0);

    const counts = [countLines(agents), countLines(claude), countLines(gemini)];
    const stripped = [agents, claude, gemini].map((text) => text.replace(SYNC_LINE_RE, ''));
    const lineCountMatch = counts[0] === counts[1] && counts[0] === counts[2];
    const contentMatch = stripped[0] === stripped[1] && stripped[0] === stripped[2];

    if (lineCountMatch && contentMatch) process.exit(0);

    const detail = lineCountMatch
      ? `content differs (line counts match at ${counts[0]})`
      : `line counts are ${counts.join('/')}`;
    const warning = `⚠️  MD DRIFT: AGENTS.md/CLAUDE.md/GEMINI.md ${detail} in ${repoName}. Edit AGENTS.md with apply_patch to re-sync, or inspect manually.`;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: warning
      }
    }));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`codex md-sync-check error: ${err.message}\n`);
    process.exit(0);
  }
});
