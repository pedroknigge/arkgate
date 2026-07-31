import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  antigravityHooks,
  claudeSettings,
  codexHooks,
  grokHooks,
} from '../../../bin/lib/hook-templates.mjs';
import { withDistLock } from '../../helpers/distLock';

const repoRoot = process.cwd();
const mcpBin = path.join(repoRoot, 'bin', 'ark-mcp.mjs');

function createProject(label: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `ark-mcp-portable-${label}-`));
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    `${JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    })}\n`
  );
  return root;
}

function identityCall(
  root: string,
  expectedRoot: string,
  options: {
    rootEnv?: string;
    env?: NodeJS.ProcessEnv;
    expectedProjectId?: string;
  } = {}
) {
  const messages = [
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    },
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'ark_identity',
        arguments: {
          project: {
            expectedRoot,
            ...(options.expectedProjectId
              ? { expectedProjectId: options.expectedProjectId }
              : {}),
          },
        },
      },
    },
  ];
  const argv = [mcpBin, '--root', root];
  if (options.rootEnv) argv.push('--root-env', options.rootEnv);
  const result = spawnSync(process.execPath, argv, {
    cwd: repoRoot,
    input: `${messages.map((message) => JSON.stringify(message)).join('\n')}\n`,
    encoding: 'utf8',
    timeout: 30_000,
    env: options.env ?? process.env,
  });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const response = result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((message) => message.id === 2);
  expect(response).toBeTruthy();
  return response.result;
}

describe('MCP project identity portability', () => {
  beforeAll(() => {
    withDistLock(() => {
      const build = spawnSync('npm', ['run', 'build'], {
        cwd: repoRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
      });
      expect(build.status, build.stderr || build.stdout).toBe(0);
    });
  }, 120_000);

  it('uses native canonical paths and keeps project identity stable across process restarts', () => {
    const root = createProject('stable');
    try {
      const first = identityCall(root, root);
      const second = identityCall(root, root);

      expect(first.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(first.projectIdentity.resolvedRoot).toBe(fs.realpathSync(root));
      expect(first.projectIdentity.resolvedConfigPath).toBe(
        fs.realpathSync(path.join(root, 'ark.config.json'))
      );
      expect(first.projectIdentity.projectId).toBe(second.projectIdentity.projectId);
      expect(first.projectIdentity.contractHash).toBe(second.projectIdentity.contractHash);
      expect(first.projectIdentity.runtimeId).not.toBe(second.projectIdentity.runtimeId);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects a native path from another project before returning project analysis', () => {
    const projectA = createProject('a');
    const projectB = createProject('b');
    try {
      const result = identityCall(projectA, projectB);
      const body = JSON.parse(result.content[0].text);

      expect(result.isError).toBe(true);
      expect(result.binding).toMatchObject({
        status: 'mismatch',
        authoritative: false,
        code: 'PROJECT_ROOT_MISMATCH',
      });
      expect(body).not.toHaveProperty('layers');
      expect(body).not.toHaveProperty('arkRules');
      expect(body).not.toHaveProperty('goldenPattern');
    } finally {
      fs.rmSync(projectA, { recursive: true, force: true });
      fs.rmSync(projectB, { recursive: true, force: true });
    }
  });

  it('requires a prior project id for descendant paths on every platform', () => {
    const root = createProject('descendant');
    const descendant = path.join(root, 'packages', 'app');
    fs.mkdirSync(descendant, { recursive: true });
    try {
      const exact = identityCall(root, root);
      const initialDescendant = identityCall(root, descendant);
      const boundDescendant = identityCall(root, descendant, {
        expectedProjectId: exact.projectIdentity.projectId,
      });

      expect(initialDescendant.binding).toMatchObject({
        status: 'unverified',
        authoritative: false,
      });
      expect(boundDescendant.binding).toMatchObject({
        status: 'matched',
        authoritative: true,
      });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('canonicalizes directory symlinks or Windows junctions before identity matching', () => {
    const root = createProject('linked-root');
    const aliasParent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mcp-portable-link-'));
    const alias = path.join(aliasParent, 'project-link');
    try {
      fs.symlinkSync(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
      const canonical = identityCall(root, root);
      const linked = identityCall(alias, alias);
      expect(linked.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(linked.projectIdentity.projectId).toBe(canonical.projectIdentity.projectId);
      expect(linked.projectIdentity.resolvedRoot).toBe(fs.realpathSync(root));
    } finally {
      fs.rmSync(aliasParent, { recursive: true, force: true });
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('resolves the first populated --root-env path without shell expansion', () => {
    const fallback = createProject('env-fallback');
    const envRoot = createProject('env root with spaces');
    const lowerPriority = createProject('env-lower-priority');
    try {
      const result = identityCall(fallback, envRoot, {
        rootEnv: 'ARK_EMPTY_ROOT,ARK_WORKSPACE_ROOT,ARK_OTHER_ROOT',
        env: {
          ...process.env,
          ARK_EMPTY_ROOT: '',
          ARK_WORKSPACE_ROOT: envRoot,
          ARK_OTHER_ROOT: lowerPriority,
        },
      });
      expect(result.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(result.projectIdentity.resolvedRoot).toBe(fs.realpathSync(envRoot));
    } finally {
      fs.rmSync(fallback, { recursive: true, force: true });
      fs.rmSync(envRoot, { recursive: true, force: true });
      fs.rmSync(lowerPriority, { recursive: true, force: true });
    }
  });

  it('keeps --root as the safe fallback when every --root-env variable is absent', () => {
    const fallback = createProject('missing-env-fallback');
    try {
      const env = { ...process.env };
      delete env.ARK_MISSING_ROOT_A;
      delete env.ARK_MISSING_ROOT_B;
      const result = identityCall(fallback, fallback, {
        rootEnv: 'ARK_MISSING_ROOT_A,ARK_MISSING_ROOT_B',
        env,
      });
      expect(result.binding).toMatchObject({ status: 'matched', authoritative: true });
      expect(result.projectIdentity.resolvedRoot).toBe(fs.realpathSync(fallback));
    } finally {
      fs.rmSync(fallback, { recursive: true, force: true });
    }
  });

  it('emits shell-independent hook roots for every supported hook host', () => {
    const claude = JSON.parse(claudeSettings(repoRoot));
    const codex = JSON.parse(codexHooks(repoRoot));
    const grok = JSON.parse(grokHooks(repoRoot));
    const antigravity = JSON.parse(antigravityHooks(repoRoot));
    const claudeCommands = [
      claude.hooks.SessionStart[0].hooks[0].command,
      claude.hooks.PreToolUse[0].hooks[0].command,
    ];
    const codexCommands = [
      codex.hooks.SessionStart[0].hooks[0].command,
      codex.hooks.PreToolUse[0].hooks[0].command,
    ];
    const grokCommands = [
      grok.hooks.SessionStart[0].hooks[0].command,
      grok.hooks.PreToolUse[0].hooks[0].command,
    ];
    const antigravityCommands = [
      antigravity['ark-write-gate'].PreToolUse[0].hooks[0].command,
    ];

    expect(claudeCommands).toEqual([
      'npx arkgate-mcp --session-context --root . --root-env CLAUDE_PROJECT_DIR --config ark.config.json',
      'npx arkgate-mcp --hook --hook-repair --fail-on-new-smells --root . --root-env CLAUDE_PROJECT_DIR --config ark.config.json',
    ]);
    expect(codexCommands).toEqual([
      'npx arkgate-mcp --session-context --root . --root-env CODEX_PROJECT_DIR --config ark.config.json',
      'npx arkgate-mcp --hook --hook-repair --fail-on-new-smells --root . --root-env CODEX_PROJECT_DIR --config ark.config.json',
    ]);
    expect(grokCommands).toEqual([
      'npx arkgate-mcp --session-context --root . --root-env GROK_WORKSPACE_ROOT,CLAUDE_PROJECT_DIR --config ark.config.json',
      'npx arkgate-mcp --hook --hook-repair --fail-on-new-smells --root . --root-env GROK_WORKSPACE_ROOT,CLAUDE_PROJECT_DIR --config ark.config.json',
    ]);
    expect(antigravityCommands).toEqual([
      'npx arkgate-mcp --hook --hook-repair --fail-on-new-smells --root . --config ark.config.json',
    ]);
    for (const hooks of [
      ...claudeCommands,
      ...codexCommands,
      ...grokCommands,
      ...antigravityCommands,
    ]) {
      expect(hooks).not.toMatch(/\$(?:\{|[A-Za-z_])/);
    }
  });

  it.runIf(process.platform === 'win32')(
    'accepts Windows drive-letter case differences after realpath canonicalization',
    () => {
      const root = createProject('drive-case');
      try {
        const alternateCase = `${root[0] === root[0].toUpperCase() ? root[0].toLowerCase() : root[0].toUpperCase()}${root.slice(1)}`;
        const result = identityCall(root, alternateCase);
        expect(result.binding).toMatchObject({ status: 'matched', authoritative: true });
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  );
});
