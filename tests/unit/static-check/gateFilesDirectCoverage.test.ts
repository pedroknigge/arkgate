import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  compactRouterHost,
  ensureDirForFile,
  ensureTypecheckScript,
  hasArkAgentsContract,
  hasArkMcpRegistration,
  hasArkWorkflow,
  hasCheckArchitectureScript,
  isArkAgentsContent,
  isCompactRouterAgentsContent,
  isSelfHostedLibraryAgents,
  missingGates,
  packageScriptsHaveTypecheck,
  readJson,
  readPackageJson,
  treeHasTypecheckScript,
  writeTemplate,
} from '../../../bin/lib/gate-files.mjs';
import {
  codexHooks,
  codexProjectConfig,
} from '../../../bin/lib/hook-templates.mjs';

const roots: string[] = [];

function temporaryRoot(label = 'ark-gate-files-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), label));
  roots.push(root);
  return root;
}

function writeFile(root: string, relativePath: string, content: string) {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeJson(root: string, relativePath: string, value: unknown) {
  return writeFile(root, relativePath, `${JSON.stringify(value, null, 2)}\n`);
}

function writeMcp(
  root: string,
  server: Record<string, unknown>,
  relativePath = '.mcp.json'
) {
  writeJson(root, relativePath, { mcpServers: { ark: server } });
}

function writeWorkflow(root: string, content: string) {
  writeFile(root, '.github/workflows/ark.yml', `${content.trim()}\n`);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('gate-files direct behavior', () => {
  it('reads package metadata and detects typecheck scripts through shallow workspaces', () => {
    const root = temporaryRoot();
    expect(readPackageJson(root)).toBeNull();
    expect(hasCheckArchitectureScript(root)).toBe(false);
    expect(packageScriptsHaveTypecheck(null)).toBe(false);
    expect(packageScriptsHaveTypecheck('tsc')).toBe(false);
    expect(packageScriptsHaveTypecheck({ typecheck: '  ' })).toBe(false);

    for (const scripts of [
      { typecheck: 'tsc --noEmit' },
      { 'type-check': 'tsc -p .' },
      { 'check:types': 'vue-tsc' },
      { tsc: 'node ./scripts/tsc --noEmit' },
    ]) {
      expect(packageScriptsHaveTypecheck(scripts)).toBe(true);
    }
    expect(packageScriptsHaveTypecheck({ tsc: 'echo compiler' })).toBe(false);

    writeJson(root, 'package.json', {
      name: 'host',
      scripts: { 'check:architecture': 'ark-check --strict' },
    });
    expect(readJson(path.join(root, 'package.json')).name).toBe('host');
    expect(readPackageJson(root)?.name).toBe('host');
    expect(hasCheckArchitectureScript(root)).toBe(true);
    expect(treeHasTypecheckScript(root)).toBe(false);

    writeFile(root, 'apps/broken/package.json', '{');
    writeJson(root, 'apps/web/package.json', {
      scripts: { typecheck: 'tsc --noEmit' },
    });
    writeJson(root, '.hidden/package.json', {
      scripts: { typecheck: 'should be ignored' },
    });
    writeJson(root, 'node_modules/example/package.json', {
      scripts: { typecheck: 'should be ignored' },
    });
    expect(treeHasTypecheckScript(root)).toBe(true);

    const fileRoot = writeFile(temporaryRoot(), 'not-a-directory', 'x');
    expect(treeHasTypecheckScript(fileRoot)).toBe(false);
  });

  it('bootstraps typecheck conservatively and honors dry-run and nested scripts', () => {
    const noConfig = temporaryRoot();
    writeJson(noConfig, 'package.json', { scripts: {} });
    expect(ensureTypecheckScript(noConfig)).toEqual({
      changed: false,
      reason: 'no-tsconfig',
    });

    const noPackage = temporaryRoot();
    writeJson(noPackage, 'jsconfig.json', {});
    expect(ensureTypecheckScript(noPackage)).toEqual({
      changed: false,
      reason: 'no-package-json',
    });

    const dryRun = temporaryRoot();
    writeJson(dryRun, 'tsconfig.json', {});
    writeJson(dryRun, 'package.json', { name: 'dry-run', scripts: { lint: 'eslint .' } });
    expect(ensureTypecheckScript(dryRun, { write: false })).toEqual({
      changed: true,
      reason: 'added',
      script: 'tsc --noEmit',
    });
    expect(readPackageJson(dryRun)?.scripts).toEqual({ lint: 'eslint .' });
    expect(ensureTypecheckScript(dryRun)).toMatchObject({ changed: true, reason: 'added' });
    expect(readPackageJson(dryRun)?.scripts?.typecheck).toBe('tsc --noEmit');
    expect(ensureTypecheckScript(dryRun)).toEqual({
      changed: false,
      reason: 'already',
    });

    const nested = temporaryRoot();
    writeJson(nested, 'tsconfig.json', {});
    writeJson(nested, 'package.json', { name: 'workspace' });
    writeJson(nested, 'packages/api/package.json', {
      scripts: { 'check:types': 'tsc --noEmit' },
    });
    expect(ensureTypecheckScript(nested)).toEqual({
      changed: false,
      reason: 'already',
    });
  });

  it('accepts only exact project-bound MCP launchers across package managers', () => {
    const root = temporaryRoot();
    const binding = ['--root', '.', '--config', 'ark.config.json'];
    const validServers = [
      { command: 'arkgate-mcp', args: binding },
      { command: 'ark-mcp.mjs', args: [...binding].reverse().reverse() },
      { command: 'npx.cmd', args: ['arkgate-mcp.cmd', ...binding] },
      { command: 'yarn', args: ['ark-mcp', ...binding] },
      { command: 'pnpm', args: ['exec', 'arkgate-mcp', ...binding] },
      {
        command: 'pnpm',
        args: [
          '--config.verify-deps-before-run=false',
          'exec',
          'arkgate-mcp',
          ...binding,
        ],
      },
      { command: 'node.exe', args: ['bin/ark-mcp.mjs', ...binding] },
      { command: 'npx', cwd: 'nested', args: ['arkgate-mcp', '--root', '..', '--config', 'ark.config.json'] },
    ];

    for (const server of validServers) {
      writeMcp(root, server);
      expect(hasArkMcpRegistration(root), JSON.stringify(server)).toBe(true);
    }

    const invalidServers: Array<Record<string, unknown>> = [
      {},
      { command: 42 },
      { command: 'npx', args: 'arkgate-mcp' },
      { command: 'npx', args: ['arkgate-mcp', 42] },
      { command: 'echo', args: ['arkgate-mcp', ...binding] },
      { command: 'npx', args: ['arkgate-mcp', 'ark-mcp', ...binding] },
      { command: 'pnpm', args: ['run', 'arkgate-mcp', ...binding] },
      { command: 'node', args: ['ark-mcp.mjs', ...binding] },
      { command: 'npx', args: ['arkgate-mcp', '--root', '.'] },
      { command: 'npx', args: ['arkgate-mcp', '--root', '.', '--root', '.'] },
      { command: 'npx', args: ['arkgate-mcp', '--root', '-', '--config', 'ark.config.json'] },
      { command: 'npx', args: ['arkgate-mcp', '--root', '.', '--config', '../ark.config.json'] },
      { command: 'npx', cwd: '', args: ['arkgate-mcp', ...binding] },
      { command: 'npx', cwd: 'nested', args: ['arkgate-mcp', ...binding] },
    ];
    for (const server of invalidServers) {
      writeMcp(root, server);
      expect(hasArkMcpRegistration(root), JSON.stringify(server)).toBe(false);
    }

    writeFile(root, '.mcp.json', '{');
    expect(hasArkMcpRegistration(root)).toBe(false);
    writeMcp(root, { command: 'npx', args: ['arkgate-mcp', ...binding] }, '.cursor/mcp.json');
    expect(hasArkMcpRegistration(root, '.cursor/mcp.json')).toBe(true);
  });

  it('validates direct and package-script AGENTS contracts fail-closed', () => {
    const root = temporaryRoot();
    const direct = `# Ark Enforcement

\`ark.config.json\` is authoritative.
Run \`ark-check --strict-config\` after edits.
`;
    expect(hasArkAgentsContract(root)).toBe(false);
    writeFile(root, 'AGENTS.md', direct);
    expect(hasArkAgentsContract(root)).toBe(true);

    writeFile(
      root,
      'AGENTS.md',
      '# ArkGate Enforcement\n\nark.config.json is authoritative.\nRun npm run check:architecture.\n'
    );
    writeJson(root, 'package.json', {
      scripts: { 'check:architecture': 'npx ark-check --strict-merge' },
    });
    expect(hasArkAgentsContract(root)).toBe(true);

    for (const command of ['pnpm run check:architecture', 'yarn check:architecture']) {
      writeFile(
        root,
        'AGENTS.md',
        `## Ark Enforcement\n\nark.config.json is authoritative.\nRun ${command}.\n`
      );
      expect(hasArkAgentsContract(root)).toBe(true);
    }

    writeJson(root, 'package.json', {
      scripts: { 'check:architecture': 'npx ark-check --strict; exit 0' },
    });
    expect(hasArkAgentsContract(root)).toBe(false);
    writeFile(root, 'package.json', '{');
    expect(hasArkAgentsContract(root)).toBe(false);
    writeFile(root, 'AGENTS.md', '# Ark Enforcement\nark.config.json is authoritative.\n');
    expect(hasArkAgentsContract(root)).toBe(false);
  });

  it('proves workflow dependency chains and rejects conditional or malformed gates', () => {
    const root = temporaryRoot();
    expect(hasArkWorkflow(root)).toBe(false);
    writeJson(root, 'package.json', {
      scripts: { 'check:architecture': 'npx ark-check --strict-merge' },
    });

    const workflow = (prepCondition = '', needs = 'needs: prep') => `
jobs:
  prep:
    ${prepCondition}
    runs-on: ubuntu-latest
    steps:
      - run: echo ready
  lint:
    if: true
    runs-on: ubuntu-latest
    steps:
      - run: echo lint
  ark:
    ${needs}
    runs-on: ubuntu-latest
    steps:
      - run: npm run check:architecture
`;

    writeWorkflow(root, workflow());
    expect(hasArkWorkflow(root)).toBe(true);
    writeWorkflow(root, workflow('if: ${{ false }}'));
    expect(hasArkWorkflow(root)).toBe(false);
    writeWorkflow(root, workflow('if: always()'));
    expect(hasArkWorkflow(root)).toBe(true);
    writeWorkflow(root, workflow('if: ${{ true }}'));
    expect(hasArkWorkflow(root)).toBe(true);
    writeWorkflow(root, workflow('', 'needs: missing'));
    expect(hasArkWorkflow(root)).toBe(false);
    writeWorkflow(root, workflow('', 'needs:\n      - prep\n      # retained comment\n      - lint'));
    expect(hasArkWorkflow(root)).toBe(true);
    writeWorkflow(root, workflow('', 'needs:\n      - ${{ matrix.job }}'));
    expect(hasArkWorkflow(root)).toBe(false);

    writeWorkflow(
      root,
      `
jobs:
  prep:
    needs: ark
    runs-on: ubuntu-latest
    steps:
      - run: echo prep
  ark:
    needs: prep
    runs-on: ubuntu-latest
    steps:
      - run: npm run check:architecture
`
    );
    expect(hasArkWorkflow(root)).toBe(false);

    writeWorkflow(
      root,
      `
jobs:
  ark:
    runs-on: ubuntu-latest
    steps:
      - name: Ark
        uses: pedroknigge/arkgate@v4
        with:
          strict-config: true
outside: value
`
    );
    expect(hasArkWorkflow(root)).toBe(true);
    writeWorkflow(
      root,
      `
jobs:
  ark:
    runs-on: ubuntu-latest
    steps:
      - uses: pedroknigge/arkgate@v4
        with:
          strict-config: false
`
    );
    expect(hasArkWorkflow(root)).toBe(false);

    fs.mkdirSync(path.join(root, '.github/workflows/broken.yml'));
    writeFile(root, '.github/workflows/ark.yml', 'name: no gate\n');
    expect(hasArkWorkflow(root)).toBe(false);
  });

  it('checks compact host ownership, including exact Codex hook semantics', () => {
    const hostFiles: Record<string, string[]> = {
      claude: ['.claude/settings.json'],
      grok: ['.grok/config.toml', '.grok/hooks/ark-write-gate.json'],
      windsurf: ['.windsurf/rules/ark.md'],
      cline: ['.clinerules/ark.md'],
      copilot: ['.github/copilot-instructions.md'],
      kiro: ['.kiro/steering/ark.md'],
      roo: ['.roo/rules/ark.md'],
      continue: ['.continue/rules/ark.md'],
      gemini: ['GEMINI.md'],
    };

    expect(compactRouterHost(temporaryRoot())).toBeNull();
    expect(isCompactRouterAgentsContent(null)).toBe(false);
    expect(isCompactRouterAgentsContent('<!-- arkgate:compact-router host=claude -->')).toBe(true);

    for (const [host, files] of Object.entries(hostFiles)) {
      const root = temporaryRoot(`ark-compact-${host}-`);
      writeFile(root, 'AGENTS.md', `<!-- arkgate:compact-router host=${host} -->\n`);
      expect(compactRouterHost(root)).toBe(host);
      expect(missingGates(root)).toContain(`compact host registration (${host})`);
      for (const file of files) writeFile(root, file, 'configured\n');
      expect(missingGates(root)).not.toContain(`compact host registration (${host})`);
    }

    const none = temporaryRoot('ark-compact-none-');
    writeFile(none, 'AGENTS.md', '<!-- arkgate:compact-router host=none -->\n');
    writeMcp(none, {
      command: 'npx',
      args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
    });
    expect(missingGates(none)).not.toContain('compact host registration (none)');

    const cursor = temporaryRoot('ark-compact-cursor-');
    writeFile(cursor, 'AGENTS.md', '<!-- arkgate:compact-router host=cursor -->\n');
    writeMcp(
      cursor,
      {
        command: 'npx',
        args: ['arkgate-mcp', '--root', '.', '--config', 'ark.config.json'],
      },
      '.cursor/mcp.json'
    );
    expect(missingGates(cursor)).not.toContain('compact host registration (cursor)');

    const unknown = temporaryRoot('ark-compact-unknown-');
    writeFile(unknown, 'AGENTS.md', '<!-- arkgate:compact-router host=unknown -->\n');
    expect(missingGates(unknown)).toContain('compact host registration (unknown)');

    const codex = temporaryRoot('ark-compact-codex-');
    writeFile(codex, 'AGENTS.md', '<!-- arkgate:compact-router host=codex -->\n');
    writeFile(codex, '.codex/config.toml', codexProjectConfig(codex));
    const hooksPath = writeFile(codex, '.codex/hooks.json', codexHooks(codex));
    expect(missingGates(codex)).not.toContain('compact host registration (codex)');

    const hooks = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    hooks.hooks.SessionStart[0].hooks[0].command += ' && echo bypass';
    writeJson(codex, '.codex/hooks.json', hooks);
    expect(missingGates(codex)).toContain('compact host registration (codex)');

    writeFile(codex, '.codex/hooks.json', codexHooks(codex));
    const wrongMatcher = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    wrongMatcher.hooks.PreToolUse[0].matcher = 'Read|Write';
    writeJson(codex, '.codex/hooks.json', wrongMatcher);
    expect(missingGates(codex)).toContain('compact host registration (codex)');

    writeFile(codex, '.codex/hooks.json', '{');
    expect(missingGates(codex)).toContain('compact host registration (codex)');
  });

  it('preserves project-owned templates and reports every write outcome', () => {
    const root = temporaryRoot();
    const nested = path.join(root, 'nested/deep/file.txt');
    ensureDirForFile(nested);
    expect(fs.existsSync(path.dirname(nested))).toBe(true);
    expect(isArkAgentsContent(null)).toBe(false);
    expect(isArkAgentsContent('   ')).toBe(false);
    expect(isArkAgentsContent('  # ArkGate Enforcement\n')).toBe(true);
    expect(isArkAgentsContent('# Project\n\n# Ark Enforcement\n')).toBe(false);
    expect(isSelfHostedLibraryAgents(null)).toBe(false);
    expect(isSelfHostedLibraryAgents('## Identity - read this first')).toBe(true);
    expect(isSelfHostedLibraryAgents('mother / canonical development repository')).toBe(true);
    expect(isSelfHostedLibraryAgents('Git / clone only')).toBe(true);
    expect(isSelfHostedLibraryAgents('# Ark Enforcement')).toBe(false);

    expect(writeTemplate(root, 'notes.txt', 'one\n', false).status).toBe('written');
    expect(writeTemplate(root, 'notes.txt', 'two\n', false).status).toBe('skipped');
    expect(writeTemplate(root, 'notes.txt', 'three\n', true).status).toBe('written');
    expect(fs.readFileSync(path.join(root, 'notes.txt'), 'utf8')).toBe('three\n');

    writeFile(root, 'AGENTS.md', '# Ark Enforcement\nowned\n');
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nnew\n', false).status).toBe(
      'skipped'
    );
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nnew\n', true).status).toBe(
      'written'
    );

    writeFile(root, 'AGENTS.md', '# Product\nkeep this\n');
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nmerge\n', false).status).toBe(
      'skipped-non-ark'
    );
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nmerge\n', true).status).toBe(
      'merged'
    );
    expect(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8')).toContain('keep this');

    writeFile(root, 'AGENTS.md', '# Product\nark.config.json is authoritative\n');
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nmerge\n', true).status).toBe(
      'skipped-non-ark'
    );
    writeFile(root, 'AGENTS.md', '## Identity — read this first\n');
    expect(writeTemplate(root, 'AGENTS.md', '# Ark Enforcement\nreplace\n', true).status).toBe(
      'skipped-self-hosted'
    );

    const blockedRoot = writeFile(temporaryRoot(), 'file-root', 'not a directory');
    expect(writeTemplate(blockedRoot, 'nested/file.txt', 'x', true).status).toBe('failed');

    const unreadableAgents = temporaryRoot();
    fs.mkdirSync(path.join(unreadableAgents, 'AGENTS.md'));
    expect(
      writeTemplate(unreadableAgents, 'AGENTS.md', '# Ark Enforcement\n', true).status
    ).toBe('failed');
  });
});
