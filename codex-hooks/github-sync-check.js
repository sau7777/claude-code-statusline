#!/usr/bin/env node
// Codex SessionStart hook: reports local git state and cached origin divergence,
// then refreshes that cache in a detached background process for the next run.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync, spawn } = require('child_process');

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  try {
    const payload = JSON.parse(raw || '{}');
    const cwd = typeof payload.cwd === 'string' ? payload.cwd : process.cwd();
    const codexHome = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
    const cacheDir = path.join(codexHome, 'cache');
    const cacheFile = path.join(cacheDir, 'github-sync.json');
    fs.mkdirSync(cacheDir, { recursive: true });

    const git = (args) => {
      try {
        return execFileSync('git', args, {
          encoding: 'utf8', cwd, windowsHide: true, timeout: 5000,
          stdio: ['pipe', 'pipe', 'ignore']
        }).trim();
      } catch {
        return null;
      }
    };

    if (!git(['rev-parse', '--git-dir'])) process.exit(0);
    const remoteUrl = git(['remote', 'get-url', 'origin']);
    if (!remoteUrl) process.exit(0);
    const branch = git(['branch', '--show-current']);
    if (!branch) process.exit(0);

    const repoName = remoteUrl.replace(/.*(?:[:/])/, '').replace(/\.git$/, '') || path.basename(cwd);
    const status = git(['status', '--porcelain']);
    const cacheKey = `${cwd}::${branch}`;
    let cached = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (parsed.key === cacheKey) cached = parsed;
    } catch {}

    const alerts = [];
    if (status) {
      const count = status.split('\n').filter(Boolean).length;
      alerts.push(`⚠️  UNCOMMITTED CHANGES: ${count} file(s) in ${repoName} (${branch}).`);
    }
    if (cached) {
      const ageMinutes = Math.max(0, Math.floor((Date.now() - cached.checked) / 60000));
      const age = ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ago`;
      const ahead = Number(cached.ahead) || 0;
      const behind = Number(cached.behind) || 0;
      if (ahead > 0 && behind > 0) alerts.push(`🔴 ORIGIN DIVERGED: ${ahead} ahead, ${behind} behind [checked ${age}].`);
      else if (behind > 0) alerts.push(`🟡 ORIGIN BEHIND: ${behind} commit(s); consider git pull [checked ${age}].`);
      else if (ahead > 0) alerts.push(`🟡 ORIGIN AHEAD: ${ahead} commit(s); consider git push [checked ${age}].`);
    }

    if (alerts.length > 0) {
      const message = alerts.join('\n');
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: message
        }
      }));
    }

    const backgroundScript = `
const fs = require('fs');
const { execFileSync } = require('child_process');
const cwd = ${JSON.stringify(cwd)};
const branch = ${JSON.stringify(branch)};
const cacheFile = ${JSON.stringify(cacheFile)};
const key = ${JSON.stringify(cacheKey)};
function git(args) {
  try { return execFileSync('git', args, { encoding: 'utf8', cwd, windowsHide: true, timeout: 30000, stdio: ['pipe', 'pipe', 'ignore'] }).trim(); }
  catch { return null; }
}
git(['fetch', 'origin', '--quiet', '--no-tags']);
const ref = 'refs/remotes/origin/' + branch;
const behind = parseInt(git(['rev-list', '--count', 'HEAD..' + ref]), 10) || 0;
const ahead = parseInt(git(['rev-list', '--count', ref + '..HEAD']), 10) || 0;
try { fs.writeFileSync(cacheFile, JSON.stringify({ key, behind, ahead, checked: Date.now() }, null, 2)); } catch {}
`;
    const child = spawn(process.execPath, ['-e', backgroundScript], {
      cwd, detached: true, stdio: 'ignore', windowsHide: true
    });
    child.unref();
    process.exit(0);
  } catch (err) {
    process.stderr.write(`codex github-sync-check error: ${err.message}\n`);
    process.exit(0);
  }
});
