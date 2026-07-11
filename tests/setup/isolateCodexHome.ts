import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TEST_HOME_ENV = 'ARK_VITEST_CODEX_HOME';
let isolatedHome = process.env[TEST_HOME_ENV];

if (!isolatedHome) {
  isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-vitest-codex-home-'));
  process.env[TEST_HOME_ENV] = isolatedHome;
  process.once('exit', () => fs.rmSync(isolatedHome, { recursive: true, force: true }));
}

// Reset before every test file because focused tests may temporarily override CODEX_HOME.
process.env.CODEX_HOME = isolatedHome;
