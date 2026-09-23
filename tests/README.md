# Tests

Small smoke tests for the dependency-free statusline:

```bash
node tests/statusline-smoke.test.js
```

They execute `statusline.js` in a VM harness with `child_process` stubbed and use only Node.js built-ins.

The separate Codex hook smoke tests cover hook syntax, JSON configuration,
drift detection, safe no-ops, and `AGENTS.md` mirroring:

```bash
node tests/codex-hooks-smoke.test.js
```
