import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ARCHITECTURE_PRESETS } from '../../../bin/lib/presets.mjs';
import {
  ARK_CONFIG_SCHEMA,
  ARK_CONFIG_MIGRATIONS,
  ARK_CONFIG_SCHEMA_URL,
  ARK_CONFIG_SCHEMA_VERSION,
  DEFAULT_ARK_CONFIG_RULES,
  loadArkConfigContract,
  migrateArkConfig,
  parseArkConfigJson,
  withArkConfigMetadata,
} from '../../../src/domain/configContract';
import {
  loadArkConfigContract as loadGeneratedArkConfigContract,
  parseArkConfigJson as parseGeneratedArkConfigJson,
} from '../../../bin/lib/config-contract.mjs';
import { loadArkConfig as loadEslintArkConfig } from '../../../src/eslint/index';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const ARK_CHECK = path.join(REPO_ROOT, 'bin/ark-check.mjs');
const CASES = JSON.parse(
  fs.readFileSync(path.join(REPO_ROOT, 'tests/fixtures/config-contract/cases.json'), 'utf8')
) as {
  publishedConfigFiles: string[];
  previousMajor: { tag: string; configFile: string; expectedConfigFile: string };
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

function repositoryConfigFiles(directory = REPO_ROOT, found: string[] = []): string[] {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'dist' || entry.name === 'node_modules') continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) repositoryConfigFiles(absolute, found);
    else if (entry.name === 'ark.config.json') {
      found.push(path.relative(REPO_ROOT, absolute).split(path.sep).join('/'));
    }
  }
  return found.sort();
}

const REPOSITORY_CONFIG_FILES = repositoryConfigFiles();

const VALID_MINIMAL_CONFIG = {
  include: ['src'],
  layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
  rules: [],
};

const CONTRACT_LOADERS = [
  { surface: 'canonical', load: loadArkConfigContract },
  { surface: 'generated CLI', load: loadGeneratedArkConfigContract },
] as const;

const INVALID_CONTRACT_CASES = [
  { name: 'a null root', input: null, path: '$', message: 'must be an object' },
  { name: 'an array root', input: [], path: '$', message: 'received array' },
  {
    name: 'a non-string schema reference',
    input: { ...VALID_MINIMAL_CONFIG, $schema: 7 },
    path: '$.$schema',
    message: 'must be a string',
  },
  {
    name: 'a non-array include',
    input: { ...VALID_MINIMAL_CONFIG, include: 'src' },
    path: '$.include',
    message: 'must be an array',
  },
  {
    name: 'an empty include',
    input: { ...VALID_MINIMAL_CONFIG, include: [] },
    path: '$.include',
    message: 'at least 1 item',
  },
  {
    name: 'duplicate include entries',
    input: { ...VALID_MINIMAL_CONFIG, include: ['src', 'src'] },
    path: '$.include',
    message: 'duplicate items',
  },
  {
    name: 'a non-object layer',
    input: { ...VALID_MINIMAL_CONFIG, layers: [null] },
    path: '$.layers[0]',
    message: 'must be an object',
  },
  {
    name: 'a layer without a name',
    input: { ...VALID_MINIMAL_CONFIG, layers: [{ patterns: ['src/domain/**'] }] },
    path: '$.layers[0].name',
    message: 'is required',
  },
  {
    name: 'a non-string layer name',
    input: { ...VALID_MINIMAL_CONFIG, layers: [{ name: 7, patterns: ['src/domain/**'] }] },
    path: '$.layers[0].name',
    message: 'must be a string',
  },
  {
    name: 'an empty layer name',
    input: { ...VALID_MINIMAL_CONFIG, layers: [{ name: '', patterns: ['src/domain/**'] }] },
    path: '$.layers[0].name',
    message: 'at least 1 character',
  },
  {
    name: 'empty layer patterns',
    input: { ...VALID_MINIMAL_CONFIG, layers: [{ name: 'DomainModel', patterns: [] }] },
    path: '$.layers[0].patterns',
    message: 'at least 1 item',
  },
  {
    name: 'duplicate layer patterns',
    input: {
      ...VALID_MINIMAL_CONFIG,
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**', 'src/domain/**'] }],
    },
    path: '$.layers[0].patterns',
    message: 'duplicate items',
  },
  {
    name: 'a non-boolean layer option',
    input: {
      ...VALID_MINIMAL_CONFIG,
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], optional: 'yes' }],
    },
    path: '$.layers[0].optional',
    message: 'must be a boolean',
  },
  {
    name: 'an unsupported cycle policy',
    input: { ...VALID_MINIMAL_CONFIG, cyclePolicy: 'sometimes' },
    path: '$.cyclePolicy',
    message: 'must be one of',
  },
  {
    name: 'a null safety policy',
    input: { ...VALID_MINIMAL_CONFIG, safety: null },
    path: '$.safety',
    message: 'must be an object',
  },
  {
    name: 'a fractional safety threshold',
    input: { ...VALID_MINIMAL_CONFIG, safety: { maxAnyCasts: 1.5 } },
    path: '$.safety.maxAnyCasts',
    message: 'must be an integer',
  },
  {
    name: 'a negative safety threshold',
    input: { ...VALID_MINIMAL_CONFIG, safety: { maxTsSuppressions: -1 } },
    path: '$.safety.maxTsSuppressions',
    message: 'must be at least 0',
  },
  {
    name: 'a rule without allowed',
    input: {
      ...VALID_MINIMAL_CONFIG,
      rules: [{ from: 'DomainModel', to: 'Kernel' }],
    },
    path: '$.rules[0].allowed',
    message: 'is required',
  },
  {
    name: 'a non-boolean rule verdict',
    input: {
      ...VALID_MINIMAL_CONFIG,
      rules: [{ from: 'DomainModel', to: 'Kernel', allowed: 'no' }],
    },
    path: '$.rules[0].allowed',
    message: 'must be a boolean',
  },
  {
    name: 'a non-string allowlist entry',
    input: { ...VALID_MINIMAL_CONFIG, dynamicImportAllowlist: [7] },
    path: '$.dynamicImportAllowlist[0]',
    message: 'must be a string',
  },
  {
    name: 'an unknown non-identifier key',
    input: { ...VALID_MINIMAL_CONFIG, 'unexpected-policy': true },
    path: '$["unexpected-policy"]',
    message: 'unknown field',
  },
] as const;

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

  it.each(REPOSITORY_CONFIG_FILES)('%s loads through the canonical contract', (configFile) => {
    const json = fs.readFileSync(path.join(REPO_ROOT, configFile), 'utf8');
    expect(() => parseArkConfigJson(json, configFile)).not.toThrow();
  });

  it('keeps the generated JSON Schema identical to the canonical schema', () => {
    const packagedSchema = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'schemas/ark.config.schema.json'), 'utf8')
    );
    expect(packagedSchema).toEqual(ARK_CONFIG_SCHEMA);
  });

  it('migrates the previous supported major deterministically without mutating it', () => {
    const source = readConfig(CASES.previousMajor.configFile);
    const before = structuredClone(source);
    const expected = readConfig(CASES.previousMajor.expectedConfigFile);
    const first = loadArkConfigContract(source, CASES.previousMajor.configFile);
    const second = loadArkConfigContract(source, CASES.previousMajor.configFile);

    expect(CASES.previousMajor.tag).toBe('v1.19.0');
    expect(ARK_CONFIG_MIGRATIONS).toEqual([{ from: 'unversioned', to: '1.0' }]);
    expect(migrateArkConfig(source, CASES.previousMajor.configFile).candidate).toEqual(expected);
    expect(first.migratedFrom).toBe('unversioned');
    expect(first.config).toEqual(expected);
    expect(second).toEqual(first);
    expect(source).toEqual(before);
  });

  it('keeps canonical, generated CLI, and ESLint loaders byte-for-byte equivalent', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-config-parity-'));
    tempRoots.push(root);
    const configPath = path.join(root, 'ark.config.json');
    const json = JSON.stringify({ include: ['src'] });
    fs.writeFileSync(configPath, json);

    const canonical = parseArkConfigJson(json, configPath).config;
    const generated = parseGeneratedArkConfigJson(json, configPath).config;
    const eslint = loadEslintArkConfig(configPath);

    expect(generated).toEqual(canonical);
    expect(eslint).toEqual(canonical);
    expect(canonical.rules).toEqual(DEFAULT_ARK_CONFIG_RULES);
  });

  it.each(
    CONTRACT_LOADERS.flatMap(({ surface, load }) =>
      INVALID_CONTRACT_CASES.map((testCase) => ({ surface, load, ...testCase }))
    )
  )('$surface rejects $name at $path', ({ load, input, path: issuePath, message }) => {
    expect(() => load(input)).toThrow(issuePath);
    expect(() => load(input)).toThrow(message);
  });

  it('exports and publishes the schema through stable package subpaths', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
      files: string[];
    };
    expect(pkg.exports['./schema']).toBe('./schemas/ark.config.schema.json');
    expect(pkg.exports['./schema/ark.config.schema.json']).toBe(
      './schemas/ark.config.schema.json'
    );
    expect(pkg.files).toContain('schemas');
  });

  it('versions detected init output and the printed starter profile', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-versioned-init-'));
    tempRoots.push(root);
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');

    const init = spawnSync(process.execPath, [ARK_CHECK, '--init', '--root', root], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const printed = spawnSync(process.execPath, [ARK_CHECK, '--print-config', 'eleven-layer'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    expect(init.status, init.stderr).toBe(0);
    expect(readConfig(path.relative(REPO_ROOT, path.join(root, 'ark.config.json')))).toMatchObject({
      $schema: ARK_CONFIG_SCHEMA_URL,
      schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
    });
    expect(printed.status, printed.stderr).toBe(0);
    expect(JSON.parse(printed.stdout)).toMatchObject({
      $schema: ARK_CONFIG_SCHEMA_URL,
      schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
    });
  });

  it.each([
    {
      name: 'layer',
      input: {
        ...VALID_MINIMAL_CONFIG,
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], unexpected: true }],
      },
      path: '$.layers[0].unexpected',
    },
    {
      name: 'rule',
      input: {
        ...VALID_MINIMAL_CONFIG,
        rules: [{ from: 'DomainModel', to: 'Kernel', allowed: false, unexpected: true }],
      },
      path: '$.rules[0].unexpected',
    },
    {
      name: 'safety',
      input: { ...VALID_MINIMAL_CONFIG, safety: { maxAnyCasts: 0, unexpected: true } },
      path: '$.safety.unexpected',
    },
  ])('rejects an unknown $name field with its JSON path', ({ input, path: issuePath }) => {
    expect(() => loadArkConfigContract(input)).toThrow(issuePath);
  });

  it('rejects unsupported versions and malformed JSON with source-aware paths', () => {
    expect(() =>
      loadArkConfigContract({ ...VALID_MINIMAL_CONFIG, schemaVersion: '2.0' }, 'future.json')
    ).toThrow('$.schemaVersion');
    expect(() => parseArkConfigJson('{ nope', 'broken.json')).toThrow(
      'Invalid ArkGate config (broken.json):\n- $: invalid JSON'
    );
  });

  it('keeps migration metadata and config metadata on their exact public contract', () => {
    expect(migrateArkConfig(VALID_MINIMAL_CONFIG)).toMatchObject({ migratedFrom: 'unversioned' });
    expect(
      migrateArkConfig({ ...VALID_MINIMAL_CONFIG, schemaVersion: ARK_CONFIG_SCHEMA_VERSION })
    ).toMatchObject({ migratedFrom: null });
    expect(() => migrateArkConfig({ ...VALID_MINIMAL_CONFIG, schemaVersion: '2.0' }, 'future.json'))
      .toThrow('unsupported version "2.0"; expected 1.0');
    expect(() => parseArkConfigJson('{', 'broken.json')).toThrow('Invalid ArkGate config (broken.json)');

    expect(
      withArkConfigMetadata({ include: ['src'], $schema: '', schemaVersion: 'legacy' })
    ).toEqual({
      $schema: ARK_CONFIG_SCHEMA_URL,
      schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
      include: ['src'],
    });
    expect(
      withArkConfigMetadata({ include: ['src'], $schema: './schema.json', schemaVersion: 'legacy' })
    ).toEqual({
      $schema: './schema.json',
      schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
      include: ['src'],
    });
  });

  it('accepts a local editor schema path while keeping the current contract version', () => {
    const result = loadArkConfigContract({
      ...VALID_MINIMAL_CONFIG,
      $schema: './node_modules/arkgate/schemas/ark.config.schema.json',
      schemaVersion: ARK_CONFIG_SCHEMA_VERSION,
    });
    expect(result.config.$schema).toContain('node_modules/arkgate');
    expect(result.config.schemaVersion).toBe(ARK_CONFIG_SCHEMA_VERSION);
    expect(ARK_CONFIG_SCHEMA_URL).toContain('arkgate@2');
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

    expect(result.status, result.stderr).toBe(2);
    expect(result.stderr).toContain('$.unexpectedPolicy');
  });

  it('makes ESLint fail closed with the same path-specific diagnostic', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-eslint-config-contract-'));
    tempRoots.push(root);
    const configPath = path.join(root, 'ark.config.json');
    fs.writeFileSync(configPath, JSON.stringify({ ...VALID_MINIMAL_CONFIG, unexpectedPolicy: true }));

    expect(() => loadEslintArkConfig(configPath)).toThrow('$.unexpectedPolicy');
  });

  it('makes MCP fail closed with the same path-specific diagnostic', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-config-contract-'));
    tempRoots.push(root);
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({ ...VALID_MINIMAL_CONFIG, unexpectedPolicy: true })
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(REPO_ROOT, 'bin/ark-mcp.mjs'),
        '--session-context',
        '--root',
        root,
        '--config',
        'ark.config.json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );

    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain('$.unexpectedPolicy');
  });
});
