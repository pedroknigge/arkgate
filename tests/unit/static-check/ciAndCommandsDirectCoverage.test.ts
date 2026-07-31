import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  agentInstructions,
  arkCheckCommand,
  checkArchitectureScriptSnippet,
  checkArgsForRoot,
  codexTomlSnippet,
  compactAgentInstructions,
  cursorRule,
  detectCiNode,
  detectNodeMajorFromWorkflows,
  ensureCheckArchitectureScript,
  githubWorkflow,
  instructionRule,
  layerPlacementTable,
  loadConfigLayersForAgents,
  mcpJson,
  packageManager,
} from '../../../bin/lib/ci-and-commands.mjs';

const roots = new Set<string>();

function tempRoot(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.add(root);
  return root;
}

function write(root: string, relative: string, contents: string) {
  const target = path.join(root, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
}

afterEach(() => {
  for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  roots.clear();
});

describe('ci-and-commands direct coverage', () => {
  it('emits package-manager-aware commands for npm, pnpm, and yarn projects', () => {
    const npmRoot = tempRoot('ark-ci-npm-');
    write(npmRoot, 'package.json', '{"name":"npm-app"}\n');
    write(npmRoot, 'package-lock.json', '{}\n');
    write(npmRoot, 'frontend/package.json', '{"name":"frontend"}\n');
    write(npmRoot, '.ark-baseline.json', '{}\n');

    expect(checkArgsForRoot(npmRoot)).toContain('--strict-config --baseline');
    expect(checkArgsForRoot(npmRoot, { requireGates: true })).toContain('--strict-merge --baseline');
    expect(packageManager(npmRoot)).toMatchObject({
      cache: 'npm',
      install: 'npm ci && (cd frontend && npm install)',
    });
    write(npmRoot, 'frontend/package-lock.json', '{}\n');
    expect(packageManager(npmRoot).install).toContain('cd frontend && npm ci');
    expect(arkCheckCommand(npmRoot)).toMatch(/^npx ark-check /);
    expect(checkArchitectureScriptSnippet(npmRoot)).toContain('"check:architecture"');

    const pnpmRoot = tempRoot('ark-ci-pnpm-');
    write(pnpmRoot, 'package.json', '{"name":"pnpm-app","packageManager":"pnpm@10.0.0"}\n');
    expect(packageManager(pnpmRoot)).toMatchObject({
      cache: 'pnpm',
      setup: ['corepack enable'],
      install: 'pnpm install --frozen-lockfile',
    });
    expect(mcpJson(pnpmRoot)).toContain('"command": "pnpm"');

    const yarnRoot = tempRoot('ark-ci-yarn-');
    write(yarnRoot, 'package.json', '{"name":"yarn-app","packageManager":"yarn@1.22.22"}\n');
    expect(packageManager(yarnRoot)).toMatchObject({
      cache: 'yarn',
      setup: ['corepack enable'],
      install: 'yarn install --frozen-lockfile',
    });
    expect(mcpJson(yarnRoot)).toContain('"command": "yarn"');
  });

  it('adds the architecture script without changing the surrounding JSON style', () => {
    const missing = tempRoot('ark-ci-no-pkg-');
    expect(ensureCheckArchitectureScript(missing)).toEqual({
      changed: false,
      reason: 'no-package-json',
    });

    const dryRun = tempRoot('ark-ci-dry-');
    write(dryRun, 'package.json', '{"name":"dry"}');
    expect(ensureCheckArchitectureScript(dryRun, { write: false })).toMatchObject({
      changed: true,
      reason: 'added',
    });
    expect(fs.readFileSync(path.join(dryRun, 'package.json'), 'utf8')).toBe('{"name":"dry"}');

    const compact = tempRoot('ark-ci-compact-');
    write(compact, 'package.json', '{"name":"compact","scripts":{"test":"vitest"}}');
    expect(ensureCheckArchitectureScript(compact).changed).toBe(true);
    const compactPackage = JSON.parse(fs.readFileSync(path.join(compact, 'package.json'), 'utf8'));
    expect(compactPackage.scripts).toMatchObject({ test: 'vitest' });
    expect(compactPackage.scripts['check:architecture']).toContain('ark-check');
    expect(ensureCheckArchitectureScript(compact)).toEqual({ changed: false, reason: 'already' });

    const emptyScripts = tempRoot('ark-ci-empty-scripts-');
    write(emptyScripts, 'package.json', '{\r\n  "name": "empty",\r\n  "scripts": {\r\n  }\r\n}\r\n');
    ensureCheckArchitectureScript(emptyScripts);
    const preserved = fs.readFileSync(path.join(emptyScripts, 'package.json'), 'utf8');
    expect(preserved).toContain('\r\n');
    expect(JSON.parse(preserved).scripts['check:architecture']).toContain('ark-check');

    const noScripts = tempRoot('ark-ci-no-scripts-');
    write(noScripts, 'package.json', '{\n  "name": "multiline"\n}\n');
    ensureCheckArchitectureScript(noScripts);
    expect(JSON.parse(fs.readFileSync(path.join(noScripts, 'package.json'), 'utf8')).scripts).toBeTruthy();

    const malformedScripts = tempRoot('ark-ci-bad-scripts-');
    write(malformedScripts, 'package.json', '{"scripts":{');
    expect(() => ensureCheckArchitectureScript(malformedScripts)).toThrow(SyntaxError);

    const malformedRoot = tempRoot('ark-ci-bad-root-');
    write(malformedRoot, 'package.json', '{"name":"broken"');
    expect(() => ensureCheckArchitectureScript(malformedRoot)).toThrow(SyntaxError);
  });

  it('renders full and compact agent surfaces from live and fallback layer contracts', () => {
    const root = tempRoot('ark-ci-agents-');
    write(root, 'package.json', '{"name":"agents"}\n');
    write(
      root,
      'ark.config.json',
      JSON.stringify({
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            intentPrefixes: ['Domain.'],
          },
          {
            layer: 'Kernel',
            patterns: [],
            prefixes: [],
          },
          {},
        ],
      })
    );

    const layers = loadConfigLayersForAgents(root);
    expect(layers).toHaveLength(3);
    expect(layerPlacementTable(layers)).toContain('| Unknown | — | — |');
    expect(layerPlacementTable()).toContain('Conventional directories');
    expect(agentInstructions(root)).toContain('3** configured layer(s)');
    expect(compactAgentInstructions(root)).toContain('host=none');
    expect(compactAgentInstructions(root, 'codex')).toContain('--tools codex');
    expect(mcpJson(root)).toContain('"--config"');
    expect(codexTomlSnippet(root)).toContain('[mcp_servers.ark]');
    expect(instructionRule(root)).toContain('ark_identity');
    expect(cursorRule(root)).toContain('validate_code');

    const invalid = tempRoot('ark-ci-invalid-config-');
    write(invalid, 'package.json', '{"name":"invalid"}\n');
    write(invalid, 'ark.config.json', '{');
    expect(loadConfigLayersForAgents(invalid)).toBeNull();
    expect(agentInstructions(invalid)).toContain('default 11-layer placement');

    const empty = tempRoot('ark-ci-empty-config-');
    write(empty, 'ark.config.json', '{"layers":[]}\n');
    expect(loadConfigLayersForAgents(empty)).toBeNull();
    expect(loadConfigLayersForAgents(tempRoot('ark-ci-missing-config-'))).toBeNull();
  });

  it('detects portable Node declarations and renders every workflow command family', () => {
    const missing = tempRoot('ark-ci-node-missing-');
    expect(detectNodeMajorFromWorkflows(missing)).toBeNull();
    expect(detectCiNode(missing)).toEqual({ kind: 'default', value: '24' });

    const unreadable = tempRoot('ark-ci-node-unreadable-');
    write(unreadable, '.github/placeholder', '');
    write(unreadable, '.github/workflows', 'not a directory');
    expect(detectNodeMajorFromWorkflows(unreadable)).toBeNull();

    const workflows = tempRoot('ark-ci-node-workflows-');
    write(workflows, '.github/workflows/ark-check.yml', '\nnode-version: 99\n');
    write(workflows, '.github/workflows/notes.txt', '\nnode-version: 98\n');
    fs.mkdirSync(path.join(workflows, '.github/workflows/broken.yml'), { recursive: true });
    write(workflows, '.github/workflows/old.yaml', '\nnode-version: 18\n');
    write(workflows, '.github/workflows/current.yml', '\n  - node-version: "22.x"\n');
    expect(detectNodeMajorFromWorkflows(workflows)).toBe('22');
    expect(detectCiNode(workflows)).toEqual({ kind: 'version', value: '22' });

    const nvm = tempRoot('ark-ci-node-nvm-');
    write(nvm, '.nvmrc', '20\n');
    expect(detectCiNode(nvm)).toEqual({ kind: 'file', value: '.nvmrc' });

    const nodeVersion = tempRoot('ark-ci-node-version-');
    write(nodeVersion, '.node-version', '21\n');
    expect(detectCiNode(nodeVersion)).toEqual({ kind: 'file', value: '.node-version' });

    const engines = tempRoot('ark-ci-node-engines-');
    write(engines, 'package.json', '{"engines":{"node":">=18 <23"}}\n');
    expect(detectCiNode(engines)).toEqual({ kind: 'version', value: '18' });

    const setup = ['corepack enable'];
    const pnpm = githubWorkflow(
      { cache: 'pnpm', setup, install: 'pnpm install', run: 'pnpm exec ark-check' },
      { kind: 'file', value: '.nvmrc' },
      { hasTypecheckScript: true, hasLintScript: true }
    );
    expect(pnpm).toContain('node-version-file: .nvmrc');
    expect(pnpm).toContain('pnpm run typecheck');
    expect(pnpm).toContain('pnpm run lint');

    const yarn = githubWorkflow(
      { cache: 'yarn', setup, install: 'yarn install', run: 'yarn ark-check' },
      { kind: 'version', value: '22' },
      { hasLintScript: true }
    );
    expect(yarn).toContain("node-version: '22'");
    expect(yarn).toContain('yarn lint');

    const bun = githubWorkflow(
      { cache: 'npm', setup: [], install: 'bun install', run: 'bun run ark-check' },
      { kind: 'default', value: '24' },
      { hasTypecheckScript: true }
    );
    expect(bun).toContain('bun run typecheck');
    expect(bun).toContain('missing from lock file');

    const npm = githubWorkflow(
      { cache: 'npm', setup: [], install: '', run: 'npx ark-check' },
      { kind: 'version', value: '20' }
    );
    expect(npm).toMatch(/\n\s+npx ark-check\n/);
    expect(npm).not.toContain('name: Typecheck');
    expect(npm).not.toContain('name: Lint');
  });
});
