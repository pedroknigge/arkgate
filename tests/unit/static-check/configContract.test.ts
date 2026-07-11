import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ARK_CHECK = path.join(REPO_ROOT, 'bin/ark-check.mjs');
const CASES = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tests/fixtures/config-contract/cases.json'), 'utf8')
) as {
  publishedConfigFiles: string[];
  previousMajor: { tag: string; configFile: string };
};

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function readConfig(relativePath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8')) as Record<
    string,
    unknown
  >;
}

function runCheck(root: string, config = 'ark.config.json') {
  return spawnSync(
    process.execPath,
    [ARK_CHECK, '--root', root, '--config', config, '--coverage', '--json', '--no-cache'],
    { cwd: REPO_ROOT, encoding: 'utf8' }
  );
}

describe('C01 config contract', () => {
  it.each(CASES.publishedConfigFiles)('%s declares its schema and schema version', (configFile) => {
    const config = readConfig(configFile);

    expect(config.$schema, `${configFile} $schema`).toBeTypeOf('string');
    expect(config.schemaVersion, `${configFile} schemaVersion`).toBeTypeOf('string');
  });

  it.each(Object.entries(ARCHITECTURE_PRESETS))(
    'preset %s emits versioned contract metadata',
    (name, createPreset) => {
      const config = createPreset([], undefined) as Record<string, unknown>;

      expect(config.$schema, `${name} $schema`).toBeTypeOf('string');
      expect(config.schemaVersion, `${name} schemaVersion`).toBeTypeOf('string');
    }
  );

  it('keeps the previous supported major as an explicit compatibility fixture', () => {
    const configPath = path.join(REPO_ROOT, CASES.previousMajor.configFile);
    const result = runCheck(path.dirname(configPath));

    expect(CASES.previousMajor.tag).toBe('v1.19.0');
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects an unknown top-level key with its JSON path', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-config-contract-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src'));
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ include: ['src'], layers: [], rules: [], unexpectedPolicy: true })
    );

    const result = runCheck(root);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('$.unexpectedPolicy');
  });
});
