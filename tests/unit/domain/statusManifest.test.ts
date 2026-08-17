/**
 * ACS03 — unified status manifest (Domain pure + CLI schema parity).
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARK_STATUS_MANIFEST_SCHEMA,
  ARK_STATUS_MANIFEST_SCHEMA_VERSION,
  buildStatusManifest,
  classifyStatusWritePath,
  evaluateStatusBinding,
  projectStatusImprovementCompass,
  resolveStatusNextAction,
} from '../../../src/domain/statusManifest';
import {
  ARK_STATUS_MANIFEST_SCHEMA as CLI_SCHEMA,
  ARK_STATUS_MANIFEST_SCHEMA_VERSION as CLI_VERSION,
  buildStatusManifest as cliBuild,
  evaluateStatusBinding as cliEvaluateBinding,
} from '../../../bin/lib/status-manifest.mjs';
import {
  buildProjectStatusManifest,
  classifyExpectedRootRelation,
  countArkruleFrozenKeys,
  lastCheckFactsFromSnapshot,
  runStatusCommand,
} from '../../../bin/lib/status-command.mjs';
import { createProjectId } from '../../../src/domain/projectIdentity';

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('statusManifest (Domain — ACS03)', () => {
  it('exposes schema 1.0 and required envelope fields', () => {
    expect(ARK_STATUS_MANIFEST_SCHEMA_VERSION).toBe('1.0');
    expect(ARK_STATUS_MANIFEST_SCHEMA.required).toEqual(
      expect.arrayContaining([
        'schemaVersion',
        'arkgateVersion',
        'projectIdentity',
        'activation',
        'lastCheck',
        'rules',
        'nextAction',
      ])
    );
  });

  it('builds a complete status snapshot from pure facts', () => {
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const status = buildStatusManifest({
      arkgateVersion: '4.3.0',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      projectId,
      activeHost: 'claude',
      hardWriteActive: true,
      softWriteHost: false,
      lastCheckAt: '2026-08-08T00:00:00.000Z',
      lastCheckVerdict: 'pass',
      activeViolations: 0,
      frozenResidual: 3,
      arkRulesLoaded: true,
      rulesInventoried: 4,
      rulesUnderContract: 2,
      rulesFrozenResidual: 1,
    });

    expect(status.schemaVersion).toBe('1.0');
    expect(status.arkgateVersion).toBe('4.3.0');
    expect(status.projectIdentity).toMatchObject({
      projectId,
      resolvedRoot: '/repo',
      binding: 'matched',
      authoritative: true,
    });
    expect(status.activation.writePath).toBe('hard');
    expect(status.lastCheck).toEqual({
      at: '2026-08-08T00:00:00.000Z',
      verdict: 'pass',
      activeViolations: 0,
      frozenResidual: 3,
    });
    expect(status.rules).toEqual({
      arkRulesLoaded: true,
      inventoried: 4,
      underContract: 2,
      frozenResidual: 1,
    });
    expect(status.nextAction.id).toBeTruthy();
    expect(status.nextAction.summary.length).toBeGreaterThan(10);
  });

  it('matches identity when expectation equals resolved root + project id', () => {
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const binding = evaluateStatusBinding({
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/repo', expectedProjectId: projectId },
      expectedRootRelation: 'exact',
    });
    expect(binding).toMatchObject({ status: 'matched', authoritative: true });
  });

  it('marks stale / wrong project as mismatch (PROJECT_ROOT_MISMATCH)', () => {
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const binding = evaluateStatusBinding({
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/other-project' },
      expectedRootRelation: 'outside',
    });
    expect(binding.status).toBe('mismatch');
    expect(binding.code).toBe('PROJECT_ROOT_MISMATCH');
    expect(binding.authoritative).toBe(false);

    const status = buildStatusManifest({
      arkgateVersion: '4.2.1',
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      projectId,
      expectation: { expectedRoot: '/other-project' },
      expectedRootRelation: 'outside',
    });
    expect(status.projectIdentity.binding).toBe('mismatch');
    expect(status.nextAction.id).toBe('rebind-project-identity');
  });

  it('marks project id mismatch as stale identity', () => {
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const otherId = createProjectId('/other', '/other/ark.config.json', sha256Hex);
    const binding = evaluateStatusBinding({
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/repo', expectedProjectId: otherId },
      expectedRootRelation: 'exact',
    });
    expect(binding.status).toBe('mismatch');
    expect(binding.code).toBe('PROJECT_ID_MISMATCH');
  });

  it('keeps soft hosts advisory and never hard', () => {
    expect(
      classifyStatusWritePath({
        hardWriteActive: true,
        softWriteHost: true,
        activeHost: 'codex',
      })
    ).toBe('advisory');
    expect(
      classifyStatusWritePath({
        hardWriteActive: false,
        softWriteHost: false,
        activeHost: 'unknown',
      })
    ).toBe('unavailable');
    expect(
      classifyStatusWritePath({
        hardWriteActive: true,
        softWriteHost: false,
        activeHost: 'cursor',
      })
    ).toBe('hard');
  });

  it('prefers nextAction override when supplied', () => {
    const action = resolveStatusNextAction(
      {
        arkgateVersion: '4.2.1',
        resolvedRoot: '/repo',
        resolvedConfigPath: '/repo/ark.config.json',
        nextActionOverride: { id: 'custom', summary: 'Do the custom thing' },
      },
      { status: 'matched', authoritative: true },
      { writePath: 'hard', host: 'claude', honestLabel: 'hard' },
      { at: null, verdict: null, activeViolations: null, frozenResidual: null },
      { arkRulesLoaded: false, inventoried: null, underContract: null, frozenResidual: null }
    );
    expect(action).toEqual({ id: 'custom', summary: 'Do the custom thing' });
  });

  it('does not say stay-enforced when leftover design work remains', () => {
    const binding = { status: 'matched' as const, authoritative: true };
    const activation = { writePath: 'hard' as const, host: 'claude', honestLabel: 'hard' };
    const lastCheck = {
      at: '2026-08-16T00:00:00.000Z',
      verdict: 'pass' as const,
      activeViolations: 0,
      frozenResidual: 0,
    };
    const rules = {
      arkRulesLoaded: false,
      inventoried: null,
      underContract: null,
      frozenResidual: null,
    };
    const clean = resolveStatusNextAction(
      {
        arkgateVersion: '4.6.1',
        resolvedRoot: '/repo',
        resolvedConfigPath: '/repo/ark.config.json',
      },
      binding,
      activation,
      lastCheck,
      rules
    );
    expect(clean.id).toBe('stay-enforced');
    const leftover = resolveStatusNextAction(
      {
        arkgateVersion: '4.6.1',
        resolvedRoot: '/repo',
        resolvedConfigPath: '/repo/ark.config.json',
        leftoverDesignWork: true,
      },
      binding,
      activation,
      lastCheck,
      rules
    );
    expect(leftover.id).toBe('map-leftover-design');
    expect(leftover.summary).toMatch(/leftover design work/i);
    expect(leftover.id).not.toBe('stay-enforced');
  });

  it('CLI pure artifact matches Domain schema version and binding behavior', () => {
    expect(CLI_VERSION).toBe(ARK_STATUS_MANIFEST_SCHEMA_VERSION);
    expect(CLI_SCHEMA).toEqual(ARK_STATUS_MANIFEST_SCHEMA);
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const domain = buildStatusManifest({
      arkgateVersion: '4.2.1',
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/stale' },
      expectedRootRelation: 'outside',
    });
    const cli = cliBuild({
      arkgateVersion: '4.2.1',
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/stale' },
      expectedRootRelation: 'outside',
    });
    expect(cli.projectIdentity.binding).toBe(domain.projectIdentity.binding);
    expect(cliEvaluateBinding({
      resolvedRoot: '/repo',
      projectId,
      expectation: { expectedRoot: '/stale' },
      expectedRootRelation: 'outside',
    }).code).toBe('PROJECT_ROOT_MISMATCH');
  });

  it('publishes the schema through stable package subpaths', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(pkg.exports['./schema/status-manifest']).toBe(
      './schemas/ark.status-manifest.schema.json'
    );
    expect(pkg.exports['./schema/ark.status-manifest.schema.json']).toBe(
      './schemas/ark.status-manifest.schema.json'
    );
    expect(fs.existsSync(path.resolve('schemas/ark.status-manifest.schema.json'))).toBe(true);
  });
});

describe('status-command tooling (ACS03)', () => {
  it('classifies expected root relation exact / descendant / outside', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-status-'));
    const child = path.join(tmp, 'packages', 'app');
    fs.mkdirSync(child, { recursive: true });
    expect(classifyExpectedRootRelation(tmp, tmp)).toBe('exact');
    expect(classifyExpectedRootRelation(tmp, child)).toBe('descendant');
    expect(classifyExpectedRootRelation(tmp, path.join(os.tmpdir(), 'elsewhere-nope'))).toBe(
      'outside'
    );
  });

  it('maps latest snapshot + baseline into last-check facts', () => {
    const facts = lastCheckFactsFromSnapshot(
      {
        generatedAt: '2026-08-01T12:00:00.000Z',
        ok: false,
        activeViolations: 2,
      },
      { exists: true, keys: new Set(['a', 'b', 'c']) }
    );
    expect(facts).toEqual({
      lastCheckAt: '2026-08-01T12:00:00.000Z',
      lastCheckVerdict: 'fail',
      activeViolations: 2,
      frozenResidual: 3,
    });
  });

  it('counts only ArkRules-plane keys for rules.frozenResidual (not all baseline debt)', () => {
    const keys = new Set([
      'LAYER_IMPORT_VIOLATION|src/a.ts|A|B|',
      'ARKRULE_STRUCTURE|src/domain/x.ts|||aggregate-private-state',
      'INVARIANT_UNCOVERED|tests/x.test.ts|||always-valid',
      'CAPABILITY_VIOLATION|src/b.ts|||fetch',
      'ARKRULE_INVARIANT|src/domain/y.ts|||inv-1',
    ]);
    expect(countArkruleFrozenKeys({ exists: true, keys })).toBe(3);
    expect(countArkruleFrozenKeys({ exists: true, keys: new Set() })).toBe(0);
    expect(countArkruleFrozenKeys({ exists: false, keys: new Set(['ARKRULE_STRUCTURE|x']) })).toBe(
      null
    );
  });

  it('builds project status for this repo with matched identity (no expectation)', () => {
    const root = path.resolve('.');
    const status = buildProjectStatusManifest({
      root,
      arkgateVersion: '4.2.1',
      host: 'unknown',
    });
    expect(status.schemaVersion).toBe('1.0');
    expect(status.projectIdentity.binding).toBe('matched');
    expect(status.projectIdentity.projectId).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(status.projectIdentity.resolvedRoot).toBeTruthy();
    expect(status.activation.writePath).toMatch(/hard|advisory|unavailable/);
    expect(status.nextAction.id).toBeTruthy();
  });

  it('stale expected-root produces mismatch via CLI facts path', () => {
    const root = path.resolve('.');
    const status = buildProjectStatusManifest({
      root,
      expectedRoot: path.resolve('/tmp/ark-status-stale-other-project'),
      arkgateVersion: '4.2.1',
      host: 'unknown',
    });
    expect(status.projectIdentity.binding).toBe('mismatch');
    expect(status.projectIdentity.code).toBe('PROJECT_ROOT_MISMATCH');
    expect(status.nextAction.id).toBe('rebind-project-identity');
  });

  it('runStatusCommand emits JSON without prompts and exits 1 on mismatch', () => {
    const lines: string[] = [];
    const code = runStatusCommand({
      root: path.resolve('.'),
      json: true,
      expectedRoot: path.resolve('/tmp/ark-status-stale-cli'),
      arkgateVersion: '4.2.1',
      host: 'unknown',
      write: (line) => lines.push(line),
    });
    expect(code).toBe(1);
    const body = JSON.parse(lines.join('\n')) as {
      projectIdentity: { binding: string };
      schemaVersion: string;
    };
    expect(body.schemaVersion).toBe('1.0');
    expect(body.projectIdentity.binding).toBe('mismatch');
  });

  it('runStatusCommand forces JSON under CI=1 without prompts', () => {
    const prev = process.env.CI;
    process.env.CI = '1';
    try {
      const lines: string[] = [];
      const code = runStatusCommand({
        root: path.resolve('.'),
        json: false,
        arkgateVersion: '4.2.1',
        host: 'unknown',
        write: (line) => lines.push(line),
      });
      expect(code).toBe(0);
      const body = JSON.parse(lines.join('\n')) as {
        schemaVersion: string;
        improvementCompass?: { mode: string; notAScore: boolean; topResidual: string[] };
      };
      expect(body.schemaVersion).toBe('1.0');
      // DF02 — always project honesty mode; never invent green without facts.
      expect(body.improvementCompass).toBeDefined();
      expect(body.improvementCompass?.notAScore).toBe(true);
      expect(['full', 'subset', 'unavailable']).toContain(body.improvementCompass?.mode);
      if (body.improvementCompass?.mode === 'unavailable') {
        expect(body.improvementCompass.topResidual).toEqual([]);
      }
    } finally {
      if (prev === undefined) delete process.env.CI;
      else process.env.CI = prev;
    }
  });

  it('project status always includes honest improvementCompass (DF02)', () => {
    const status = buildProjectStatusManifest({
      root: path.resolve('.'),
      arkgateVersion: '4.5.0',
      host: 'unknown',
    });
    expect(status.improvementCompass).toBeDefined();
    expect(status.improvementCompass?.notAScore).toBe(true);
    expect(['full', 'subset', 'unavailable']).toContain(status.improvementCompass?.mode);
  });

  it('injected full compass residual does not flip nextAction vs unavailable', () => {
    const root = path.resolve('.');
    const base = buildProjectStatusManifest({
      root,
      arkgateVersion: '4.5.0',
      host: 'unknown',
      improvementCompass: projectStatusImprovementCompass({
        mode: 'unavailable',
        topResidual: [],
      }),
    });
    const withResidual = buildProjectStatusManifest({
      root,
      arkgateVersion: '4.5.0',
      host: 'unknown',
      improvementCompass: projectStatusImprovementCompass({
        mode: 'full',
        topResidual: ['soc', 'dip'],
        factsSource: 'doctor-facts',
      }),
    });
    expect(withResidual.improvementCompass?.mode).toBe('full');
    expect(withResidual.improvementCompass?.topResidual).toEqual(['soc', 'dip']);
    // Gate isolation: residual alone must not rewrite nextAction class for same tree.
    expect(withResidual.nextAction.id).toBe(base.nextAction.id);
  });
});
