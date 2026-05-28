#!/usr/bin/env node
/* eslint-env node */
/* global process */
// Rebuild native modules pinned to a specific Node ABI so a fresh
// `npm install` on a host shipping a different Node minor doesn't trip up
// vitest with NODE_MODULE_VERSION mismatches (logged in
// docs/changelog/2026-05-27.md).
//
// We don't fail the install on rebuild errors: rebuild can flake on Windows
// when the user is mid-VS Code launch and the binary is locked. The next
// run will retry; missing native modules will surface clearly at boot.

if (process.env.SKIP_POSTINSTALL_REBUILD === '1') {
  return;
}

const { spawnSync } = require('node:child_process');

const targets = ['better-sqlite3'];
for (const target of targets) {
  const result = spawnSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['rebuild', target],
    { stdio: 'inherit' },
  );
  if (result.status !== 0) {
    process.stderr.write(
      `[postinstall] npm rebuild ${target} exited with code ${result.status}; continuing.\n`,
    );
  }
}
