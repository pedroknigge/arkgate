import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  KNOWN_TOOLS,
  SKILL_TOOL_TARGETS,
  agentsMdSkillRefs,
  arkPackageVersion,
  assessCodexSkillParity,
  assessSkillCatalogParity,
  codexConcernIsActive,
  detectActiveAgentHost,
  detectCodexHomeGap,
  detectCodexRepoSkillGap,
  detectSkillGaps,
  installedSkillVersion,
  isValidSemver,
  isVersionOlder,
  normalizeToolsList,
  planSkillInstall,
  printSkillAndCodexGapHints,
  resolveTools,
  skillContentIdentity,
  skillContentMatchesTemplate,
  skillGapsForActiveHost,
  skillTemplateBodies,
  skillTemplateNames,
  skillTemplates,
  stampSkill,
  verifyHostSkillCatalog,
} from '../../../bin/lib/skill-install.mjs';

const originalCodexHome = process.env.CODEX_HOME;
const temporaryRoots: string[] = [];

function temporaryRoot(prefix = 'ark-skill-install-') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temporaryRoots.push(root);
  return root;
}

function write(root: string, relativePath: string, content = '') {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function writeAbsolute(file: string, content = '') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (originalCodexHome === undefined) delete process.env.CODEX_HOME;
  else process.env.CODEX_HOME = originalCodexHome;
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('skill-install direct module contract', () => {
  it('normalizes host selection and resolves every portable project signal', () => {
    expect(normalizeToolsList(null)).toEqual([]);
    expect(normalizeToolsList(42)).toEqual([]);
    expect(normalizeToolsList(' Claude, agy, ,CODEX ')).toEqual([
      'claude',
      'antigravity',
      'codex',
    ]);
    expect(normalizeToolsList(['cursor,grok', ' AGY ', ''])).toEqual([
      'cursor',
      'grok',
      'antigravity',
    ]);

    expect(detectActiveAgentHost({ ARK_ACTIVE_HOST: ' CODEX ' })).toBe('codex');
    expect(detectActiveAgentHost({ GROK_BUILD: 'yes' })).toBe('grok');
    expect(detectActiveAgentHost({ XAI_GROK: '1' })).toBe('grok');
    expect(detectActiveAgentHost({ GROK_AGENT: 'true' })).toBe('grok');
    expect(detectActiveAgentHost({ GROK_WORKSPACE_ROOT: 'workspace' })).toBe('grok');
    expect(detectActiveAgentHost({ GROK_SESSION_ID: 'session' })).toBe('grok');
    expect(detectActiveAgentHost({ CLAUDE_PROJECT_DIR: 'project' })).toBe('claude');
    expect(detectActiveAgentHost({ CLAUDE_CODE: 'on' })).toBe('claude');
    expect(detectActiveAgentHost({ CLAUDECODE: '1' })).toBe('claude');
    expect(detectActiveAgentHost({ CLAUDE_CODE_ENTRYPOINT: 'cli' })).toBe('claude');
    expect(detectActiveAgentHost({ CURSOR_TRACE_ID: 'trace' })).toBe('cursor');
    expect(detectActiveAgentHost({ CURSOR_AGENT: 'agent' })).toBe('cursor');
    expect(detectActiveAgentHost({ CURSOR_AGENT_CLI: 'true' })).toBe('cursor');
    expect(detectActiveAgentHost({ CODEX_SANDBOX: '1' })).toBe('codex');
    expect(detectActiveAgentHost({ CODEX_THREAD_ID: 'thread' })).toBe('codex');
    expect(detectActiveAgentHost({ CODEX_CI: 'true' })).toBe('codex');
    expect(detectActiveAgentHost({ CODEX_SESSION_ID: 'session' })).toBe('codex');
    expect(detectActiveAgentHost({ ANTIGRAVITY: 'true' })).toBe('antigravity');
    expect(detectActiveAgentHost({ AGY: 'yes' })).toBe('antigravity');
    expect(detectActiveAgentHost({ ANTIGRAVITY_WORKSPACE: 'workspace' })).toBe('antigravity');
    expect(detectActiveAgentHost({ AGY_WORKSPACE: 'workspace' })).toBe('antigravity');
    expect(detectActiveAgentHost({ TERM_PROGRAM: 'Antigravity' })).toBe('antigravity');
    expect(detectActiveAgentHost({ OPENCODE: '1' })).toBe('opencode');
    expect(detectActiveAgentHost({ OPENCODE_SESSION_ID: 'session' })).toBe('opencode');
    expect(detectActiveAgentHost({ OPENCODE_CONFIG: 'config' })).toBe('opencode');
    expect(detectActiveAgentHost({ OPENCODE_CLI: 'on' })).toBe('opencode');
    expect(detectActiveAgentHost({ CODEX_HOME: 'installed-but-inactive' })).toBeNull();
    expect(detectActiveAgentHost({ GROK_BUILD: 'off', CLAUDE_CODE: '0' })).toBeNull();
    expect(codexConcernIsActive({ CODEX_THREAD_ID: 'thread' })).toBe(true);
    expect(codexConcernIsActive({ GROK_BUILD: '1' })).toBe(false);

    const defaultRoot = temporaryRoot();
    const fallback = resolveTools({ root: defaultRoot });
    expect(fallback.source).toBe('default');
    expect([...fallback.tools]).toEqual(['claude', 'cursor', 'codex', 'grok']);

    const explicit = resolveTools({ root: defaultRoot, tools: 'agy,codex' });
    expect(explicit.source).toBe('explicit');
    expect([...explicit.tools]).toEqual(['antigravity', 'codex']);

    const detectedRoot = temporaryRoot();
    for (const directory of [
      '.claude',
      '.cursor',
      '.codex',
      '.grok',
      '.windsurf',
      '.clinerules',
      '.kiro',
      '.roo',
      '.continue',
      '.gemini',
      '.opencode',
      path.join('.agents'),
    ]) {
      fs.mkdirSync(path.join(detectedRoot, directory), { recursive: true });
    }
    write(detectedRoot, path.join('.agents', 'hooks.json'), '{}');
    write(detectedRoot, 'opencode.jsonc', '{}');
    const detected = resolveTools({ root: detectedRoot });
    expect(detected.source).toBe('detected');
    expect(detected.tools).toEqual(
      new Set([
        'claude',
        'cursor',
        'codex',
        'grok',
        'antigravity',
        'opencode',
        'windsurf',
        'cline',
        'kiro',
        'roo',
        'continue',
        'gemini',
      ])
    );

    const clineFileRoot = temporaryRoot();
    write(clineFileRoot, '.clinerules', 'legacy single-file rule');
    expect(resolveTools({ root: clineFileRoot }).tools.has('cline')).toBe(false);

    const envRoot = temporaryRoot();
    vi.stubEnv('GROK_BUILD', 'true');
    expect(resolveTools({ root: envRoot }).tools).toEqual(new Set(['grok']));

    expect(KNOWN_TOOLS).toContain('copilot');
    for (const [tool, target] of Object.entries(SKILL_TOOL_TARGETS)) {
      const relativePath = target('ark-fix');
      expect(relativePath, tool).toContain('ark-fix');
      expect(path.isAbsolute(relativePath), tool).toBe(false);
    }
  });

  it('covers stamps, content identity, SemVer precedence, and install decisions', () => {
    expect(typeof arkPackageVersion()).toBe('string');
    expect(stampSkill('plain text', '1.2.3')).toBe('plain text');
    expect(stampSkill('---\nname: ark-test\nbody', '1.2.3')).not.toContain('arkVersion');
    expect(stampSkill('---\nname: ark-test\n---\nbody\n', null)).toContain('name: ark-test');

    const base = '---\nname: ark-test\n---\nbody\n';
    const stamped = stampSkill(base, '1.2.3');
    expect(stamped).toContain('arkVersion: 1.2.3');
    expect(stampSkill(stamped, '2.0.0')).toContain('arkVersion: 2.0.0');
    expect(stampSkill(stamped, '2.0.0').match(/^arkVersion:/gm)).toHaveLength(1);

    const root = temporaryRoot();
    expect(installedSkillVersion(path.join(root, 'missing.md'))).toBeNull();
    const installed = write(root, 'SKILL.md', stamped);
    expect(installedSkillVersion(installed)).toBe('1.2.3');
    fs.mkdirSync(path.join(root, 'directory.md'));
    expect(installedSkillVersion(path.join(root, 'directory.md'))).toBeNull();

    for (const valid of [
      '0.0.0',
      '4.2.0',
      '4.2.0-alpha',
      '4.2.0-alpha.1',
      '4.2.0+build.9',
      '4.2.0-rc.1+build.9',
    ]) {
      expect(isValidSemver(valid), valid).toBe(true);
    }
    for (const invalid of [
      null,
      '1',
      '1.2',
      '01.2.3',
      '1.02.3',
      '1.2.03',
      '1.2.3-alpha.01',
      '1.2.3-',
      'not-semver',
    ]) {
      expect(isValidSemver(invalid), String(invalid)).toBe(false);
    }

    expect(isVersionOlder(null, '1.0.0')).toBe(false);
    expect(isVersionOlder('1.0.0', 'bad')).toBe(false);
    expect(isVersionOlder('1', '1.0.1')).toBe(true);
    expect(isVersionOlder('2.0.0', '1.9.9')).toBe(false);
    expect(isVersionOlder('1.2.3-alpha', '1.2.3')).toBe(true);
    expect(isVersionOlder('1.2.3', '1.2.3-alpha')).toBe(false);
    expect(isVersionOlder('1.2.3-alpha', '1.2.3-alpha.1')).toBe(true);
    expect(isVersionOlder('1.2.3-alpha.1', '1.2.3-alpha')).toBe(false);
    expect(isVersionOlder('1.2.3-alpha.2', '1.2.3-alpha.10')).toBe(true);
    expect(isVersionOlder('1.2.3-alpha.10', '1.2.3-alpha.2')).toBe(false);
    expect(isVersionOlder('1.2.3-1', '1.2.3-alpha')).toBe(true);
    expect(isVersionOlder('1.2.3-alpha', '1.2.3-1')).toBe(false);
    expect(isVersionOlder('1.2.3-alpha', '1.2.3-beta')).toBe(true);
    expect(isVersionOlder('1.2.3-beta', '1.2.3-alpha')).toBe(false);
    expect(isVersionOlder('1.2.3+one', '1.2.3+two')).toBe(false);

    expect(skillContentIdentity(null)).toBeNull();
    expect(skillContentIdentity('plain\r\ntext')).toBe(skillContentIdentity('plain\ntext'));
    expect(skillContentIdentity(stampSkill(base, '1.0.0'))).toBe(
      skillContentIdentity(stampSkill(base, '9.0.0'))
    );
    expect(skillContentMatchesTemplate(null, base)).toBe(false);
    expect(skillContentMatchesTemplate(stamped, null)).toBe(false);
    expect(skillContentMatchesTemplate(base, base)).toBe(true);
    expect(skillContentMatchesTemplate(stamped, base)).toBe(true);
    expect(skillContentMatchesTemplate(`${stamped}changed\n`, base)).toBe(false);

    expect(planSkillInstall({ targetContent: stamped })).toMatchObject({
      action: 'write',
      reason: 'missing',
      scope: 'repo',
    });
    expect(planSkillInstall({ existingContent: stamped, targetContent: stamped })).toMatchObject({
      action: 'skip',
      reason: 'content-current',
    });
    const olderStamp = stampSkill(base, '1.0.0');
    const newerStamp = stampSkill(base, '2.0.0');
    expect(planSkillInstall({ existingContent: olderStamp, targetContent: newerStamp })).toMatchObject({
      action: 'write',
      reason: 'stamp-refresh',
    });
    const withDesc = '---\nname: ark-test\ndescription: Place new code.\n---\nbody\n';
    const descStamped = stampSkill(withDesc, '1.2.3');
    expect(descStamped).toContain('arkgate@1.2.3. Place new code.');
    expect(stampSkill(descStamped, '2.0.0')).toContain('arkgate@2.0.0. Place new code.');
    expect(
      planSkillInstall({
        existingContent: descStamped,
        targetContent: stampSkill(withDesc, '2.0.0'),
      })
    ).toMatchObject({ action: 'write', reason: 'stamp-refresh' });
    expect(
      planSkillInstall({
        existingContent: stampSkill(base, '1.0.0'),
        targetContent: stampSkill(base, '2.0.0'),
        packageVersion: '2.0.0',
        scope: 'home',
      })
    ).toMatchObject({ action: 'write', reason: 'stamp-refresh' });
    expect(
      planSkillInstall({
        existingContent: stampSkill(`${base}local\n`, '2.0.0'),
        targetContent: `${base}package\n`,
        packageVersion: null,
        scope: 'home',
        force: true,
      })
    ).toMatchObject({
      action: 'skip',
      reason: 'unknown-source-version',
      conflict: true,
      downgradeBlocked: true,
    });
    expect(
      planSkillInstall({
        existingContent: stampSkill(`${base}future\n`, '9.0.0'),
        targetContent: stampSkill(`${base}package\n`, '2.0.0'),
        packageVersion: '2.0.0',
        scope: 'home',
        force: true,
      })
    ).toMatchObject({ action: 'skip', reason: 'newer-home-version' });
    expect(
      planSkillInstall({
        existingContent: `${base}local\n`,
        targetContent: `${base}package\n`,
      })
    ).toMatchObject({ action: 'skip', reason: 'existing-preserved', conflict: true });
    expect(
      planSkillInstall({
        existingContent: `${base}local\n`,
        targetContent: `${base}package\n`,
        force: true,
      })
    ).toMatchObject({ action: 'write', reason: 'content-update' });
  });

  it('assesses catalog parity and verifies referenced skills without child processes', () => {
    const root = temporaryRoot();
    const template = '---\nname: ark-one\n---\nbody\n';
    const current = stampSkill(template, '2.0.0');
    const stale = stampSkill(`${template}old body\n`, '1.0.0');
    const currentFile = write(root, 'catalog/ark-one/SKILL.md', current);
    const staleFile = write(root, 'catalog/ark-two/SKILL.md', stale);
    fs.mkdirSync(path.join(root, 'catalog', 'ark-unreadable', 'SKILL.md'), {
      recursive: true,
    });
    write(root, 'legacy/ark-one.md', 'legacy');

    const parity = assessSkillCatalogParity(
      ['ark-one', 'ark-two', 'ark-unreadable', 'ark-missing'],
      (name) => path.join(root, 'catalog', name, 'SKILL.md'),
      '2.0.0',
      {
        legacyFile: (name) => path.join(root, 'legacy', `${name}.md`),
        templateBodies: {
          'ark-one': template,
          'ark-two': template.replace('ark-one', 'ark-two'),
          'ark-unreadable': template.replace('ark-one', 'ark-unreadable'),
          'ark-missing': template.replace('ark-one', 'ark-missing'),
        },
      }
    );
    expect(currentFile).toContain(path.join('ark-one', 'SKILL.md'));
    expect(staleFile).toContain(path.join('ark-two', 'SKILL.md'));
    expect(parity).toMatchObject({
      ok: false,
      missing: 2,
      stale: 1,
      presentCount: 2,
      expectedCount: 4,
      legacyPromptsOnly: false,
      hasLegacyPrompts: true,
      legacyCount: 1,
      catalogComplete: false,
    });

    const legacyOnly = assessSkillCatalogParity(
      ['ark-one'],
      (name) => path.join(root, 'absent', name, 'SKILL.md'),
      null,
      { legacyFile: (name) => path.join(root, 'legacy', `${name}.md`) }
    );
    expect(legacyOnly).toMatchObject({
      legacyPromptsOnly: true,
      packageVersion: null,
      ok: false,
    });

    expect(agentsMdSkillRefs(null)).toEqual([]);
    expect(
      agentsMdSkillRefs('Use /ark-fix, then /ark-explore and /ark-fix; ignore /other.')
    ).toEqual(['ark-explore', 'ark-fix']);

    const consumer = temporaryRoot();
    const absentAgents = verifyHostSkillCatalog(consumer, ['codex']);
    expect(absentAgents).toEqual({
      ok: true,
      missing: [],
      referenced: [],
      checkedTools: [],
    });

    expect(
      verifyHostSkillCatalog(consumer, ['codex'], {
        agentsText: '<!-- arkgate:compact-router host=codex -->',
      })
    ).toMatchObject({ ok: true, compact: true });

    const missing = verifyHostSkillCatalog(consumer, ['codex', 'unknown', 'cursor'], {
      skillNames: ['ark-fix', 'ark-explore'],
      agentsText: 'Use /ark-fix, /ark-explore, and /ark-not-shipped.',
    });
    expect(missing.checkedTools).toEqual(['codex', 'cursor']);
    expect(missing.referenced).toEqual(['ark-explore', 'ark-fix']);
    expect(missing.missing).toHaveLength(4);

    write(consumer, SKILL_TOOL_TARGETS.codex('ark-fix'), 'skill');
    write(consumer, SKILL_TOOL_TARGETS.codex('ark-explore'), 'skill');
    const verified = verifyHostSkillCatalog(consumer, new Set(['codex']), {
      skillNames: ['ark-fix', 'ark-explore'],
      agentsText: 'Use /ark-fix and /ark-explore.',
    });
    expect(verified).toMatchObject({ ok: true, missing: [] });
  });

  it('computes repo and home Codex parity across durable metadata states', () => {
    const packageVersion = arkPackageVersion();
    expect(packageVersion).toMatch(/^\d+\.\d+\.\d+/);
    const codexHome = temporaryRoot('ark-skill-home-');
    process.env.CODEX_HOME = codexHome;

    const noAgents = temporaryRoot();
    expect(assessCodexSkillParity(noAgents)).toBeNull();

    const producer = temporaryRoot();
    write(producer, 'AGENTS.md', '# ArkGate');
    fs.mkdirSync(path.join(producer, 'templates', 'skills'), { recursive: true });
    expect(assessCodexSkillParity(producer)).toBeNull();

    const inactive = temporaryRoot();
    write(inactive, 'AGENTS.md', '# ArkGate');
    expect(assessCodexSkillParity(inactive)).toBeNull();
    expect(detectCodexHomeGap(inactive)).toBeNull();
    expect(detectCodexRepoSkillGap(inactive)).toBeNull();

    const consumer = temporaryRoot();
    write(consumer, 'AGENTS.md', '# ArkGate\nUse /ark-fix.\n');
    fs.mkdirSync(path.join(consumer, '.codex'), { recursive: true });
    const repoOnly = assessCodexSkillParity(consumer);
    expect(repoOnly).toMatchObject({
      repoNeedsAttention: true,
      homeNeedsAttention: false,
      needsAttention: true,
    });
    expect(detectCodexRepoSkillGap(consumer)).toMatchObject({
      missing: skillTemplateNames().length,
      stale: 0,
      legacyPromptsOnly: false,
    });

    const skillsDir = path.join(codexHome, 'skills');
    const catalog = path.join(skillsDir, '.arkgate-catalog.json');
    writeAbsolute(
      catalog,
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion: '99.0.0',
        skills: [
          {
            name: 'ark-fix',
            contentIdentity: `sha256:${'a'.repeat(64)}`,
          },
        ],
      })}\n`
    );
    const newer = assessCodexSkillParity(consumer);
    expect(newer?.home).toMatchObject({
      catalogVersion: '99.0.0',
      catalogNewerThanPackage: true,
      catalogMetadataInvalid: false,
    });
    expect(newer?.homeNeedsAttention).toBe(false);
    expect(detectCodexHomeGap(consumer)).toBeNull();

    fs.rmSync(catalog);
    writeAbsolute(
      path.join(skillsDir, '.arkgate-catalog.pending.json'),
      `${JSON.stringify({
        schemaVersion: '1.0',
        packageVersion,
        token: '12345678-1234-4123-8123-123456789abc',
      })}\n`
    );
    const interrupted = assessCodexSkillParity(consumer);
    expect(interrupted?.home).toMatchObject({
      pendingCatalogVersion: packageVersion,
      pendingRecoveryRequired: true,
      catalogMetadataInvalid: false,
    });
    expect(detectCodexHomeGap(consumer)).toMatchObject({
      pendingRecoveryRequired: true,
      catalogStateReason: 'interrupted catalog commit',
    });

    fs.writeFileSync(
      path.join(skillsDir, '.arkgate-catalog.pending.json'),
      '{"schemaVersion":"1.0","packageVersion":"4.2.0","token":"invalid"}\n'
    );
    const invalidPending = assessCodexSkillParity(consumer);
    expect(invalidPending?.home).toMatchObject({ catalogMetadataInvalid: true });
    expect(detectCodexHomeGap(consumer)).toMatchObject({
      catalogMetadataInvalid: true,
      catalogStateReason: 'invalid catalog metadata',
    });

    fs.rmSync(path.join(skillsDir, '.arkgate-catalog.pending.json'));
    fs.mkdirSync(catalog);
    expect(assessCodexSkillParity(consumer)?.home.catalogMetadataInvalid).toBe(true);
    fs.rmSync(catalog, { recursive: true, force: true });
    fs.writeFileSync(catalog, '{not-json');
    expect(assessCodexSkillParity(consumer)?.home.catalogMetadataInvalid).toBe(true);
  });

  it('detects direct host gaps and renders every remediation class', () => {
    const root = temporaryRoot();
    expect(detectSkillGaps(root)).toEqual([]);
    write(root, 'AGENTS.md', '# ArkGate\nUse /ark-fix.\n');

    const producer = temporaryRoot();
    write(producer, 'AGENTS.md', '# ArkGate');
    fs.mkdirSync(path.join(producer, 'templates', 'skills'), { recursive: true });
    expect(detectSkillGaps(producer)).toEqual([]);

    const compact = temporaryRoot();
    write(compact, 'AGENTS.md', '<!-- arkgate:compact-router host=codex -->');
    fs.mkdirSync(path.join(compact, '.codex'), { recursive: true });
    expect(detectSkillGaps(compact)).toEqual([]);

    for (const directory of ['.claude', '.cursor', '.codex', '.grok', '.windsurf', '.clinerules']) {
      fs.mkdirSync(path.join(root, directory), { recursive: true });
    }
    write(root, path.join('.codex', 'prompts', 'ark-fix.md'), 'legacy prompt');
    const missing = detectSkillGaps(root);
    expect(missing.map((gap) => gap.tool)).toEqual([
      'claude',
      'cursor',
      'codex',
      'grok',
      'windsurf',
      'cline',
    ]);
    expect(missing.find((gap) => gap.tool === 'codex')).toMatchObject({
      legacyPromptsOnly: true,
      hasLegacyPrompts: true,
    });

    const packageVersion = arkPackageVersion();
    for (const [name, template] of skillTemplates()) {
      write(root, SKILL_TOOL_TARGETS.codex(name), stampSkill(template, packageVersion));
    }
    const withLegacyAdvisory = detectSkillGaps(root).find((gap) => gap.tool === 'codex');
    expect(withLegacyAdvisory).toMatchObject({
      missing: 0,
      stale: 0,
      legacyAdvisory: true,
      catalogComplete: true,
    });

    const firstTemplate = skillTemplates()[0];
    write(
      root,
      SKILL_TOOL_TARGETS.claude(firstTemplate[0]),
      stampSkill(`${firstTemplate[1]}\nlocal divergence\n`, '0.0.1')
    );
    expect(detectSkillGaps(root).find((gap) => gap.tool === 'claude')?.stale).toBe(1);

    const unreadableTarget = SKILL_TOOL_TARGETS.windsurf(firstTemplate[0]);
    fs.mkdirSync(path.join(root, unreadableTarget), { recursive: true });
    expect(detectSkillGaps(root).find((gap) => gap.tool === 'windsurf')?.missing).toBe(
      skillTemplateNames().length
    );

    const allGaps = [
      { tool: 'codex', missing: 0, stale: 0, legacyPromptsOnly: true },
      {
        tool: 'codex',
        missing: 0,
        stale: 0,
        legacyAdvisory: true,
        catalogComplete: true,
      },
      { tool: 'codex', missing: 2, stale: 3 },
      { tool: 'grok', missing: 4, stale: 5 },
    ];
    expect(skillGapsForActiveHost(allGaps, {})).toEqual(allGaps);
    expect(skillGapsForActiveHost(allGaps, { ARK_ACTIVE_HOST: 'grok' })).toEqual([
      { tool: 'grok', missing: 4, stale: 5 },
    ]);
    expect(skillGapsForActiveHost(null, {})).toEqual([]);

    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const color = {
      dim: (value: string) => `DIM:${value}`,
      yellow: (value: string) => `YELLOW:${value}`,
    };
    printSkillAndCodexGapHints(root, {
      skillGaps: allGaps,
      codexHomeGap: {
        legacyPromptsOnly: true,
        missing: 2,
        stale: 3,
        pendingRecoveryRequired: true,
        catalogMetadataInvalid: false,
      },
      codexRepoSkillGap: {
        legacyPromptsOnly: true,
        missing: 2,
        stale: 3,
      },
      codexSessionActive: true,
      env: { ARK_ACTIVE_HOST: 'codex' },
      color,
    });
    expect(log.mock.calls.flat().join('\n')).toContain('YELLOW:Codex');
    expect(log.mock.calls.flat().join('\n')).toContain('interrupted catalog commit');
    expect(log.mock.calls.flat().join('\n')).toContain('repo skill catalog');

    log.mockClear();
    printSkillAndCodexGapHints(root, {
      skillGaps: [{ tool: 'grok', missing: 4, stale: 5 }],
      codexHomeGap: {
        legacyPromptsOnly: false,
        missing: 0,
        stale: 0,
        pendingRecoveryRequired: false,
        catalogMetadataInvalid: true,
      },
      codexRepoSkillGap: null,
      codexSessionActive: false,
      env: { ARK_ACTIVE_HOST: 'grok' },
      color,
    });
    const deferred = log.mock.calls.flat().join('\n');
    expect(deferred).toContain('4 /ark-* skill');
    expect(deferred).toContain('5 /ark-* skill');
    expect(deferred).toContain('invalid catalog metadata');
    expect(deferred).toContain('Deferred unless you use Codex');

    expect(Object.keys(skillTemplateBodies()).sort()).toEqual(skillTemplateNames().sort());
  });
});
