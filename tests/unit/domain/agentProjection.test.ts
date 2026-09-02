/**
 * ACS04 — version-matched agent contract projection (Domain pure + CLI parity).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import {
  AGENT_PROJECTION_ENFORCEMENT_SURFACES,
  AGENT_PROJECTION_NON_ENFORCEMENT_LABEL,
  ARK_AGENT_PROJECTION_SCHEMA_VERSION,
  DEFAULT_AGENT_PROJECTION_RULE_IDS,
  agentProjectionContentIdentity,
  buildAgentProjectionBlock,
  buildAgentProjectionBody,
  buildAgentProjectionMeta,
  extractAgentProjectionBlock,
  mergeAgentProjectionDocument,
  parseAgentProjectionStamp,
  projectionHasNonEnforcementLabel,
  projectionMatchesPackageVersion,
} from '../../../src/domain/agentProjection';
import {
  ARK_AGENT_PROJECTION_SCHEMA_VERSION as CLI_VERSION,
  DEFAULT_AGENT_PROJECTION_RULE_IDS as CLI_RULE_IDS,
  buildAgentProjectionBlock as cliBuildBlock,
  mergeAgentProjectionDocument as cliMerge,
  projectionMatchesPackageVersion as cliMatchesVersion,
} from '../../../bin/lib/agent-projection.mjs';
import { isKnownDiagnosticCode } from '../../../src/domain/diagnosticCatalog';
import {
  agentProjectionBlockForRoot,
  agentInstructions,
  compactAgentInstructions,
} from '../../../bin/lib/ci-and-commands.mjs';
import {
  planAgentProjectionRefresh,
  runAgentProjectionCommand,
} from '../../../bin/lib/agent-projection-command.mjs';

const require = createRequire(import.meta.url);
const packageJson = require('../../../package.json') as { version: string };
const PACKAGE_VERSION = packageJson.version;

function sampleFacts(overrides: Record<string, unknown> = {}) {
  return {
    arkgateVersion: PACKAGE_VERSION,
    checkCommand: 'npm run check:architecture',
    layers: [
      {
        name: 'DomainModel',
        patterns: ['src/domain/**'],
        intentPrefixes: ['Domain.'],
      },
      {
        name: 'Tooling',
        patterns: ['bin/**'],
        intentPrefixes: [],
      },
    ],
    catalogShortList: DEFAULT_AGENT_PROJECTION_RULE_IDS.map((ruleId) => ({
      ruleId,
      title: ruleId,
    })),
    profile: 'full' as const,
    diagnosticsDocsPath: 'docs/diagnostics.md',
    ...overrides,
  };
}

describe('agentProjection (Domain — ACS04)', () => {
  it('facade stays under god-module floors (Shape pilot)', () => {
    const source = fs.readFileSync(path.resolve('src/domain/agentProjection.ts'), 'utf8');
    const loc = source.split(/\r?\n/).length;
    const exports =
      source.match(
        /\bexport\s+(?:async\s+)?(?:function|class|const|let|var|type|interface|enum|default)\b|\bexport\s*\{/g
      ) ?? [];
    expect(
      loc < 400 || exports.length < 12,
      `god-module floors: ${loc} LOC, ${exports.length} exports`
    ).toBe(true);
  });

  it('exposes schema 1.0 and default short-list ruleIds that are catalogued', () => {
    expect(ARK_AGENT_PROJECTION_SCHEMA_VERSION).toBe('1.0');
    expect(DEFAULT_AGENT_PROJECTION_RULE_IDS.length).toBeGreaterThan(3);
    for (const ruleId of DEFAULT_AGENT_PROJECTION_RULE_IDS) {
      expect(isKnownDiagnosticCode(ruleId)).toBe(true);
    }
  });

  it('stamps package version and non-enforcement label into the projection block', () => {
    const block = buildAgentProjectionBlock(sampleFacts());
    expect(projectionMatchesPackageVersion(block, PACKAGE_VERSION)).toBe(true);
    expect(projectionHasNonEnforcementLabel(block)).toBe(true);
    expect(block).toContain(AGENT_PROJECTION_NON_ENFORCEMENT_LABEL);
    expect(block).toContain(`arkgateVersion=${PACKAGE_VERSION}`);
    expect(block).toContain('nonAuthoritative=true');
    for (const surface of AGENT_PROJECTION_ENFORCEMENT_SURFACES) {
      expect(block).toContain(surface);
    }
    const stamp = parseAgentProjectionStamp(block);
    expect(stamp).toEqual({
      arkgateVersion: PACKAGE_VERSION,
      schemaVersion: '1.0',
      nonAuthoritative: true,
    });
  });

  it('meta always sets nonAuthoritative true (never a gate input)', () => {
    const meta = buildAgentProjectionMeta(sampleFacts());
    expect(meta.nonAuthoritative).toBe(true);
    expect(meta.arkgateVersion).toBe(PACKAGE_VERSION);
    expect(meta.contentIdentity).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    expect(meta.layerCount).toBe(2);
    expect(meta.catalogCodeCount).toBe(DEFAULT_AGENT_PROJECTION_RULE_IDS.length);
    expect(meta.enforcementSurfaces).toEqual([...AGENT_PROJECTION_ENFORCEMENT_SURFACES]);
  });

  it('content-identity is stable for the same body and changes when version changes', () => {
    const bodyA = buildAgentProjectionBody(sampleFacts());
    const bodyB = buildAgentProjectionBody(sampleFacts());
    expect(agentProjectionContentIdentity(bodyA)).toBe(agentProjectionContentIdentity(bodyB));
    const bodyC = buildAgentProjectionBody(sampleFacts({ arkgateVersion: '0.0.0-test' }));
    expect(agentProjectionContentIdentity(bodyC)).not.toBe(agentProjectionContentIdentity(bodyA));
  });

  it('merges without rewriting customized regions outside the managed block', () => {
    const blockV1 = buildAgentProjectionBlock(sampleFacts({ arkgateVersion: '4.2.0' }));
    const customized = `# My project guide

## Custom human section
Keep this forever.

${blockV1}
## More custom
Do not touch.
`;
    const blockV2 = buildAgentProjectionBlock(sampleFacts({ arkgateVersion: PACKAGE_VERSION }));
    const merged = mergeAgentProjectionDocument(customized, blockV2);
    expect(merged.action).toBe('block-replaced');
    expect(merged.preservedOutsideBlock).toBe(true);
    expect(merged.content).toContain('## Custom human section');
    expect(merged.content).toContain('Keep this forever.');
    expect(merged.content).toContain('## More custom');
    expect(merged.content).toContain('Do not touch.');
    expect(projectionMatchesPackageVersion(merged.content, PACKAGE_VERSION)).toBe(true);
    expect(merged.content).not.toContain('arkgateVersion=4.2.0');

    const again = mergeAgentProjectionDocument(merged.content, blockV2);
    expect(again.action).toBe('unchanged');
  });

  it('inserts a block after H1 when markers are absent (preserves rest)', () => {
    const existing = `# Ark Enforcement

## Human notes
Custom placement advice.
`;
    const block = buildAgentProjectionBlock(sampleFacts());
    const merged = mergeAgentProjectionDocument(existing, block);
    expect(merged.action).toBe('block-inserted');
    expect(merged.content.startsWith('# Ark Enforcement')).toBe(true);
    expect(merged.content).toContain('## Human notes');
    expect(merged.content).toContain('Custom placement advice.');
    expect(extractAgentProjectionBlock(merged.content).block).toBeTruthy();
  });

  it('CLI pure helper stays in parity with Domain', () => {
    expect(CLI_VERSION).toBe(ARK_AGENT_PROJECTION_SCHEMA_VERSION);
    expect([...CLI_RULE_IDS]).toEqual([...DEFAULT_AGENT_PROJECTION_RULE_IDS]);
    const facts = sampleFacts();
    expect(cliBuildBlock(facts)).toBe(buildAgentProjectionBlock(facts));
    expect(cliMatchesVersion(cliBuildBlock(facts), PACKAGE_VERSION)).toBe(true);
    const merged = cliMerge('# Title\n\ncustom\n', cliBuildBlock(facts));
    expect(merged.action).toBe('block-inserted');
    expect(merged.content).toContain('custom');
  });
});

describe('agent projection install path + command (ACS04)', () => {
  it('install AGENTS templates embed version-matched projection with non-enforcement label', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-acs04-'));
    try {
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0',
            layers: [{ name: 'App', patterns: ['src/**'] }],
            rules: [],
          },
          null,
          2
        )
      );
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo', scripts: {} }));

      const full = agentInstructions(root);
      const compact = compactAgentInstructions(root, 'claude');
      const block = agentProjectionBlockForRoot(root, { profile: 'full' });

      expect(full).toContain('arkgate:agent-projection:begin');
      expect(full).toContain(`arkgateVersion=${PACKAGE_VERSION}`);
      expect(full).toContain('non-authoritative');
      expect(full).toContain('| App |');
      expect(compact).toContain('arkgate:agent-projection:begin');
      expect(compact).toContain('profile:** `compact`');
      expect(projectionMatchesPackageVersion(block, PACKAGE_VERSION)).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('ark agents-md --write refreshes stamp; --check detects version drift', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-acs04-cmd-'));
    try {
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        JSON.stringify(
          {
            schemaVersion: '1.0',
            layers: [{ name: 'Core', patterns: ['src/**'] }],
            rules: [],
          },
          null,
          2
        )
      );
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'demo' }));

      const staleBlock = buildAgentProjectionBlock(
        sampleFacts({
          arkgateVersion: '0.0.1-stale',
          layers: [{ name: 'Core', patterns: ['src/**'] }],
        })
      );
      fs.writeFileSync(
        path.join(root, 'AGENTS.md'),
        `# Ark Enforcement\n\n${staleBlock}\n## Keep me\ncustom note\n`
      );

      const lines: string[] = [];
      const err: string[] = [];
      const checkStale = runAgentProjectionCommand({
        root,
        check: true,
        json: true,
        arkgateVersion: PACKAGE_VERSION,
        writeOut: (line) => lines.push(line),
        writeErr: (line) => err.push(line),
      });
      expect(checkStale).toBe(1);
      const checkJson = JSON.parse(lines.join('\n'));
      expect(checkJson.ok).toBe(false);
      expect(checkJson.nonAuthoritative).toBe(true);

      const writeLines: string[] = [];
      const writeCode = runAgentProjectionCommand({
        root,
        write: true,
        json: true,
        arkgateVersion: PACKAGE_VERSION,
        writeOut: (line) => writeLines.push(line),
        writeErr: (line) => err.push(line),
      });
      expect(writeCode).toBe(0);
      const writeJson = JSON.parse(writeLines.join('\n'));
      expect(writeJson.wrote).toBe(true);
      expect(writeJson.nonAuthoritative).toBe(true);

      const after = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
      expect(after).toContain('## Keep me');
      expect(after).toContain('custom note');
      expect(projectionMatchesPackageVersion(after, PACKAGE_VERSION)).toBe(true);
      expect(after).not.toContain('0.0.1-stale');

      const okLines: string[] = [];
      const checkOk = runAgentProjectionCommand({
        root,
        check: true,
        json: true,
        arkgateVersion: PACKAGE_VERSION,
        writeOut: (line) => okLines.push(line),
        writeErr: (line) => err.push(line),
      });
      expect(checkOk).toBe(0);
      expect(JSON.parse(okLines.join('\n')).ok).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('plan reports package version match for generated block (drift fixture)', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-acs04-plan-'));
    try {
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        JSON.stringify({ schemaVersion: '1.0', layers: [{ name: 'A', patterns: ['a/**'] }], rules: [] })
      );
      const plan = planAgentProjectionRefresh({ root, arkgateVersion: PACKAGE_VERSION });
      expect(plan.versionMatch).toBe(true);
      expect(plan.packageVersion).toBe(PACKAGE_VERSION);
      expect(plan.stampedVersion).toBe(PACKAGE_VERSION);
      expect(plan.nonAuthoritative).toBe(true);
      expect(plan.meta.nonAuthoritative).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('projection module is not imported by analysis / gate evaluation paths', () => {
    // Hard line: projection never referenced as a gate input.
    const analysisEngine = fs.readFileSync(
      path.join(process.cwd(), 'bin/lib/analysis-engine.mjs'),
      'utf8'
    );
    const violations = fs.readFileSync(path.join(process.cwd(), 'bin/lib/violations.mjs'), 'utf8');
    const adapter = fs.readFileSync(path.join(process.cwd(), 'bin/lib/adapter-contract.mjs'), 'utf8');
    for (const source of [analysisEngine, violations, adapter]) {
      expect(source).not.toMatch(/agent-projection|agentProjection|agents-md/);
    }
  });
});
