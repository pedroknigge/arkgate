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

const TEST_CLAUDE_HOME_ENV = 'ARK_VITEST_CLAUDE_HOME';
let isolatedClaude = process.env[TEST_CLAUDE_HOME_ENV];
if (!isolatedClaude) {
  isolatedClaude = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-vitest-claude-home-'));
  process.env[TEST_CLAUDE_HOME_ENV] = isolatedClaude;
  process.once('exit', () => fs.rmSync(isolatedClaude, { recursive: true, force: true }));
}
process.env.CLAUDE_HOME = isolatedClaude;

const TEST_GROK_HOME_ENV = 'ARK_VITEST_GROK_HOME';
let isolatedGrok = process.env[TEST_GROK_HOME_ENV];
if (!isolatedGrok) {
  isolatedGrok = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-vitest-grok-home-'));
  process.env[TEST_GROK_HOME_ENV] = isolatedGrok;
  process.once('exit', () => fs.rmSync(isolatedGrok, { recursive: true, force: true }));
}
process.env.GROK_HOME = isolatedGrok;
