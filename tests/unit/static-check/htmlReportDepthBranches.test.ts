/**
 * Branch coverage for html-report-depth showcase helpers (3.0.4 release gate).
 */
import { describe, it, expect } from 'vitest';
import {
  writePathModeHint,
  inventoryConfiguredHosts,
  renderWritePathAdoptionBlock,
  renderBaselineSignalLegend,
  renderDesignDepthStrip,
  renderDesignCleanNote,
  buildReportDepthPayload,
} from '../../../bin/lib/html-report-depth.mjs';
import {
  baselineSignalHint,
  modeBadgeHint,
  metricKpi,
} from '../../../bin/lib/html-report.mjs';

describe('html-report-depth branch matrix', () => {
  it('covers writePathModeHint and inventory edge cases', () => {
    expect(writePathModeHint('repair')).toMatch(/repair/i);
    expect(writePathModeHint('reject-only')).toMatch(/without repair/i);
    expect(writePathModeHint('mcp-only')).toMatch(/Advisory MCP/i);
    expect(writePathModeHint('none')).toMatch(/No hard write/i);
    expect(writePathModeHint('weird')).toMatch(/Session write-path/i);
    expect(writePathModeHint(undefined)).toMatch(/Session write-path|No hard write/i);
    expect(writePathModeHint(null)).toMatch(/Session write-path|No hard write/i);

    expect(inventoryConfiguredHosts(null)).toEqual([]);
    expect(inventoryConfiguredHosts({})).toEqual([]);
    expect(inventoryConfiguredHosts({ inventory: {} })).toEqual([]);
    expect(inventoryConfiguredHosts({ inventory: { hosts: null } })).toEqual([]);
    expect(
      inventoryConfiguredHosts({
        inventory: {
          hosts: {
            grok: { configured: true },
            claude: { configured: false },
            cursor: null,
            codex: { configured: true },
          },
        },
      })
    ).toEqual(['grok', 'codex']);
  });

  it('covers write-path adoption block modes and empty inventory', () => {
    expect(renderWritePathAdoptionBlock(null)).toBe('');
    expect(renderWritePathAdoptionBlock('x' as unknown as object)).toBe('');

    const emptyInv = renderWritePathAdoptionBlock({
      activeHost: 'claude',
      mode: 'reject-only',
      hookPresent: true,
      hookRepair: false,
      mcpPresent: false,
    });
    expect(emptyInv).toContain('reject-only');
    expect(emptyInv).toContain('No host write gates found on disk yet');

    const repair = renderWritePathAdoptionBlock({
      activeHost: 'grok',
      mode: 'repair',
      hookRepair: true,
      hookPresent: true,
      mcpPresent: true,
      inventory: { hosts: { grok: { configured: true } } },
    });
    expect(repair).toContain('repair ✓');
    expect(repair).toContain('MCP ✓');
    expect(repair).toContain('Inventory on disk: grok');

    const withGap = renderWritePathAdoptionBlock({
      activeHost: 'cursor',
      mode: 'mcp-only',
      mcpPresent: true,
      gap: { id: 'write-path-mcp-only', message: 'advisory only' },
      inventory: { hosts: { cursor: { configured: true } } },
    });
    expect(withGap).toContain('write-path-mcp-only');
    expect(withGap).toContain('advisory only');

    const unknownEmpty = renderWritePathAdoptionBlock({
      mode: undefined,
      activeHost: undefined,
      inventory: { hosts: {} },
    });
    expect(unknownEmpty).toContain('unknown');
    expect(unknownEmpty).toContain('none');
  });

  it('covers design strip branches: smells-with-edges, golden, non-enforce mode', () => {
    expect(renderDesignDepthStrip({})).toBe('');
    expect(renderDesignDepthStrip({ designFitness: { designWeak: false }, designSmells: [] })).toBe(
      ''
    );

    const openEdges = renderDesignDepthStrip({
      mode: 'adapt',
      designFitness: { designWeak: false, smellCount: 1 },
      designSmells: [
        {
          id: 'soft-contract',
          message: 'tech only',
          evidence: ['layer:DomainModel', 'layout:features', 'src/app/x.ts'],
        },
      ],
    });
    expect(openEdges).toContain('Design smells (edges still open)');
    expect(openEdges).toContain('soft-contract');
    expect(openEdges).toContain('src/app/x.ts');
    expect(openEdges).not.toContain('layer:DomainModel');

    const weakAdapt = renderDesignDepthStrip({
      mode: 'suggest',
      designFitness: { designWeak: true, smellCount: 1 },
      designSmells: [{ id: 'god-module', outcome: 'big' }],
      pilotLoop: { active: false },
      postGreenPath: { action: 'long action text' },
      goldenPattern: { present: true, name: 'crm-cache', norm: 'split by concern', examplePath: 'lib/repos/crm-cache/index.ts' },
    });
    expect(weakAdapt).toContain('SUGGEST · design-weak');
    expect(weakAdapt).toContain('crm-cache');
    expect(weakAdapt).toContain('long action text');
    expect(weakAdapt).toContain('lib/repos/crm-cache/index.ts');

    const noGolden = renderDesignDepthStrip({
      mode: 'enforce',
      designFitness: { designWeak: true, smellCount: 1 },
      designSmells: [{ id: 'x', outcome: 'y' }],
      goldenPattern: { present: false },
    });
    expect(noGolden).toContain('golden-pattern.json');

    const pilotMove = renderDesignDepthStrip({
      mode: 'enforce',
      designFitness: { designWeak: true },
      designSmells: [{ id: 'god-module' }],
      pilotLoop: {
        active: true,
        nextPilot: {
          smellId: 'god-module',
          pilot: 'lib/**',
          fix: 'split file',
          successSignal: 'ok',
          killSwitch: 'stop',
        },
      },
    });
    expect(pilotMove).toContain('split file');
    expect(pilotMove).toContain('lib/**');
  });

  it('covers design clean note gates', () => {
    expect(renderDesignCleanNote({ ok: false, mode: 'enforce', designFitness: { designWeak: false, smellCount: 0 } })).toBe('');
    expect(renderDesignCleanNote({ ok: true, mode: 'adapt', designFitness: { designWeak: false, smellCount: 0 } })).toBe('');
    expect(renderDesignCleanNote({ ok: true, mode: 'enforce', designFitness: { designWeak: true, smellCount: 1 } })).toBe('');
    expect(renderDesignCleanNote({ ok: true, mode: 'enforce', designFitness: { designWeak: false, smellCount: 2 } })).toBe('');
    expect(
      renderDesignCleanNote({
        ok: true,
        mode: 'enforce',
        designFitness: { designWeak: false, smellCount: 0 },
      })
    ).toContain('Design depth · OK');
  });

  it('covers html-report hint helpers defaults', () => {
    expect(baselineSignalHint('keep-empty')).toMatch(/0 keys/i);
    expect(baselineSignalHint('active-ratchet')).toMatch(/freezes known debt/i);
    expect(baselineSignalHint('absent')).toMatch(/No \.ark-baseline/i);
    expect(baselineSignalHint('other')).toMatch(/frozen debt/i);
    expect(modeBadgeHint('enforce')).toMatch(/hold the line/i);
    expect(modeBadgeHint('adapt')).toMatch(/aligning/i);
    expect(modeBadgeHint('suggest')).toMatch(/Starter shape/i);
    expect(modeBadgeHint('???')).toMatch(/Operating mode/i);
    expect(metricKpi(1, 'L', 'H')).toContain('kpi-hint');
    expect(renderBaselineSignalLegend()).toContain('active-ratchet');
  });

  it('buildReportDepthPayload returns adoption + designDepth shape on empty tree', () => {
    const root = process.cwd();
    const payload = buildReportDepthPayload(
      root,
      { layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }], rules: [] },
      [],
      { governed: { percent: 0, totalFiles: 0, classifiedFiles: 0 }, layers: [] },
      []
    );
    expect(payload.adoption).toBeTruthy();
    expect(payload.designDepth.designFitness).toBeTruthy();
    expect(Array.isArray(payload.designDepth.designSmells)).toBe(true);
    expect(payload.designDepth.pilotLoop).toBeTruthy();
  });
});
