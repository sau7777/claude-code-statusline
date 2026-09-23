const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hooks = path.join(root, 'codex-hooks');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'codex-hooks-test-'));
}

function run(script, cwd, payload) {
  return spawnSync(process.execPath, [path.join(hooks, script)], {
    cwd, input: JSON.stringify(payload), encoding: 'utf8', timeout: 5000
  });
}

function writeTrio(dir, body = '# Rules\n\nKeep this synchronized.\n') {
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), `> **Sync:** agents\n${body}`);
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), `> **Sync:** claude\n${body}`);
  fs.writeFileSync(path.join(dir, 'GEMINI.md'), `> **Sync:** gemini\n${body}`);
}

const failures = [];
function check(name, fn) {
  try { fn(); } catch (err) { failures.push(`${name}\n${err.stack || err}`); }
}

check('all hook scripts parse', () => {
  for (const file of ['md-sync-check.js', 'sync-md.js', 'github-sync-check.js']) {
    const result = spawnSync(process.execPath, ['--check', path.join(hooks, file)], { encoding: 'utf8' });
    assert.strictEqual(result.status, 0, `${file}: ${result.stderr}`);
  }
});

check('hooks example is valid JSON', () => {
  JSON.parse(fs.readFileSync(path.join(hooks, 'hooks.json.example'), 'utf8'));
});

check('md drift check is silent for a synchronized trio', () => {
  const dir = tempDir();
  writeTrio(dir);
  const result = run('md-sync-check.js', dir, { cwd: dir, hook_event_name: 'SessionStart' });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(result.stdout, '');
});

check('md drift check reports Codex SessionStart context', () => {
  const dir = tempDir();
  writeTrio(dir);
  fs.appendFileSync(path.join(dir, 'CLAUDE.md'), 'drift\n');
  const result = run('md-sync-check.js', dir, { cwd: dir, hook_event_name: 'SessionStart' });
  assert.strictEqual(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.strictEqual(output.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(output.hookSpecificOutput.additionalContext, /MD DRIFT/);
});

check('sync-md mirrors root AGENTS.md after apply_patch', () => {
  const dir = tempDir();
  writeTrio(dir, '# Old\n');
  const fresh = '> **Sync:** Any changes to this file must also be applied to `CLAUDE.md` and `GEMINI.md`.\n# Fresh\n';
  fs.writeFileSync(path.join(dir, 'AGENTS.md'), fresh);
  const result = run('sync-md.js', dir, {
    cwd: dir,
    hook_event_name: 'PostToolUse',
    tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Update File: AGENTS.md\n*** End Patch' }
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.match(JSON.parse(result.stdout).systemMessage, /AGENTS\.md/);
  assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /^> \*\*Sync:\*\*.*AGENTS\.md.*GEMINI\.md/m);
  assert.match(fs.readFileSync(path.join(dir, 'GEMINI.md'), 'utf8'), /^> \*\*Sync:\*\*.*CLAUDE\.md.*AGENTS\.md/m);
  assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /# Fresh/);
});

check('sync-md ignores nested AGENTS.md and missing siblings', () => {
  const dir = tempDir();
  writeTrio(dir, '# Unchanged\n');
  const before = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
  const nested = run('sync-md.js', dir, {
    cwd: dir,
    tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Update File: docs/AGENTS.md\n*** End Patch' }
  });
  assert.strictEqual(nested.status, 0, nested.stderr);
  assert.strictEqual(nested.stdout, '');
  assert.strictEqual(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), before);

  const incomplete = tempDir();
  fs.writeFileSync(path.join(incomplete, 'AGENTS.md'), '# Only one\n');
  const missing = run('sync-md.js', incomplete, {
    cwd: incomplete,
    tool_name: 'apply_patch',
    tool_input: { command: '*** Begin Patch\n*** Update File: AGENTS.md\n*** End Patch' }
  });
  assert.strictEqual(missing.status, 0, missing.stderr);
  assert.strictEqual(missing.stdout, '');
});

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n\n')}\n`);
  process.exit(1);
}

process.stdout.write('codex hooks smoke tests: ok\n');
