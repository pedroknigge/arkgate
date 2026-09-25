/**
 * Covers shipped violations.mjs edge summary helpers used by ark-check burn-down.
 */
import { describe, it, expect } from 'vitest';
import {
  violationEdge,
  violationTargetSubtree,
  summarizeViolations,
  CONCENTRATION_MIN_VIOLATIONS,
  CONCENTRATION_SHARE,
  FIX_HINTS,
  baselineKey,
  baselineOccurrenceKeys,
  formatWarningAttribution,
  formatWarningLine,
  printWarning,
  humanWarningLines,
  formatSharedImportsSliceSummary,
  printSharedImportsSliceBridgeList,
  SHARED_IMPORTS_SLICE_FULL_LIST,
  WARNING_UNATTRIBUTED,
} from '../../../bin/lib/violations.mjs';
import { computeCoverage } from '../../../bin/lib/doctor-plan.mjs';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

describe('violations.mjs (shipped)', () => {
  it('violationEdge labels layer edges, globals, and cycles', () => {
    expect(
      violationEdge({
        ruleId: 'LAYER_IMPORT_VIOLATION',
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      })
    ).toBe('DomainModel → PersistenceAdapters');
    expect(
      violationEdge({ ruleId: 'FORBIDDEN_GLOBAL', fromLayer: 'DomainModel' })
    ).toBe('DomainModel → ambient global');
    expect(violationEdge({ ruleId: 'CIRCULAR_DEPENDENCY' })).toBe('circular dependency');
    expect(violationEdge({ ruleId: 'OTHER' })).toBe('OTHER');
  });

  it('violationTargetSubtree clusters import targets by path prefix', () => {
    expect(
      violationTargetSubtree({ target: 'src/kernel/internal/emitter.ts' })
    ).toBe('src/kernel/internal');
    expect(violationTargetSubtree({ target: 'bare' })).toBeUndefined();
  });

  it('summarizeViolations ranks edges and detects concentration', () => {
    const violations = Array.from({ length: 12 }, (_, i) => ({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      fromLayer: 'PresentationAdapters',
      toLayer: 'Kernel',
      target: `src/kernel/internal/f${i}.ts`,
      typeOnly: i % 3 === 0,
    }));
    violations.push({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
      target: 'src/db/repo.ts',
    });
    const summary = summarizeViolations(violations);
    expect(summary.total).toBe(13);
    expect(summary.edges[0].edge).toBe('PresentationAdapters → Kernel');
    expect(summary.dominantShare).toBeGreaterThan(0.8);
    expect(summary.concentrated).toBe(
      summary.total >= CONCENTRATION_MIN_VIOLATIONS &&
        summary.dominantShare >= CONCENTRATION_SHARE
    );
    expect(summary.typeOnlyCount).toBeGreaterThan(0);
    expect(FIX_HINTS.LAYER_IMPORT_VIOLATION).toMatch(/port/i);
  });

  it('warning attribution prints path:line when the finding has a file', () => {
    const warning = {
      ruleId: 'ARKORDER_GENERIC_UPDATE',
      file: 'src/main.ts',
      line: 8,
      message: 'Generic set() on the order plane rewrites a named product choice.',
    };
    expect(formatWarningAttribution(warning)).toBe('src/main.ts:8');
    expect(formatWarningLine(warning)).toBe(
      'warning ARKORDER_GENERIC_UPDATE src/main.ts:8 Generic set() on the order plane rewrites a named product choice.'
    );
  });

  it('warning attribution says so when the finding is not a file', () => {
    const warning = {
      ruleId: 'CONFIG_NO_LAYERS',
      message: 'No file layers are configured.',
    };
    expect(formatWarningAttribution(warning)).toBe(WARNING_UNATTRIBUTED);
    expect(formatWarningLine(warning)).toContain(WARNING_UNATTRIBUTED);
    expect(formatWarningLine(warning)).toContain('CONFIG_NO_LAYERS');
    printWarning(warning);
  });

  it('groups SHARED_IMPORTS_SLICE by rule and layer edge with count and top 3', () => {
    const features = Array.from({ length: 5 }, (_, index) => ({
      ruleId: 'SHARED_IMPORTS_SLICE',
      file: 'src/ui/hub.ts',
      line: index + 1,
      fromLayer: 'Features',
      toLayer: 'Features',
      target: `src/features/item-${index}/x.ts`,
      toSlice: `features/item-${index}`,
      failsStrict: false,
      message: `shared root src/ui/hub.ts → slice features/item-${index} (src/features/item-${index}/x.ts). The wall is direct-only.`,
    }));
    const screens = Array.from({ length: 4 }, (_, index) => ({
      ruleId: 'SHARED_IMPORTS_SLICE',
      file: 'src/app/hub.ts',
      line: index + 1,
      fromLayer: 'Screens',
      toLayer: 'Screens',
      target: `src/screens/item-${index}/x.ts`,
      toSlice: `screens/item-${index}`,
      failsStrict: false,
      message: `shared root src/app/hub.ts → slice screens/item-${index} (src/screens/item-${index}/x.ts). The wall is direct-only.`,
    }));
    const other = {
      ruleId: 'CONFIG_NO_LAYERS',
      message: 'No file layers are configured.',
    };
    const warnings = [other, ...features, ...screens];
    const before = JSON.stringify(warnings);
    const lines = humanWarningLines(warnings);
    expect(JSON.stringify(warnings)).toBe(before);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(formatWarningLine(other));
    expect(lines[1]).toContain('SHARED_IMPORTS_SLICE Features → Features: 5 shared-root → slice bridges');
    expect(lines[1]).toContain('src/ui/hub.ts:1 → features/item-0 (src/features/item-0/x.ts)');
    expect(lines[1]).toContain('src/ui/hub.ts:2 → features/item-1 (src/features/item-1/x.ts)');
    expect(lines[1]).toContain('src/ui/hub.ts:3 → features/item-2 (src/features/item-2/x.ts)');
    expect(lines[1]).not.toContain('features/item-3');
    expect(lines[1]).not.toContain('features/item-4');
    expect(lines[1]).toContain('The wall is direct-only.');
    expect(lines[1]).toContain(SHARED_IMPORTS_SLICE_FULL_LIST);
    expect(lines[1]).toContain('ark-check --json');
    expect(lines[1]).toContain('ark-check --doctor');
    expect(lines[2]).toContain('Screens → Screens: 4 shared-root → slice bridges');
    expect(lines[2]).not.toContain('screens/item-3');
    expect(formatSharedImportsSliceSummary(features.slice(0, 1))).toContain('1 shared-root → slice bridge');
    const flood = Array.from({ length: 1671 }, (_, index) => ({
      ruleId: 'SHARED_IMPORTS_SLICE',
      file: `src/ui/f${index}.ts`,
      line: 1,
      fromLayer: 'Features',
      toLayer: 'Features',
      toSlice: 'features/management',
      target: `src/features/management/f${index}.ts`,
      message: 'shared root. The wall is direct-only.',
    }));
    const [floodLine] = humanWarningLines(flood);
    expect(humanWarningLines(flood)).toHaveLength(1);
    expect(floodLine).toContain('1,671 shared-root → slice bridges');
    expect(floodLine).toContain('src/ui/f0.ts:1');
    expect(floodLine).toContain('src/ui/f2.ts:1');
    expect(floodLine).not.toContain('src/ui/f3.ts');
    expect(floodLine).toContain('ark-check --json');
    expect(floodLine).toContain('ark-check --doctor');
  });

  it('doctor lists every SHARED_IMPORTS_SLICE edge instead of the summary', () => {
    const warnings = Array.from({ length: 4 }, (_, index) => ({
      ruleId: 'SHARED_IMPORTS_SLICE',
      file: `src/ui/f${index}.ts`,
      line: 2,
      fromLayer: 'Features',
      toLayer: 'Features',
      target: `src/features/s${index}/x.ts`,
      toSlice: `features/s${index}`,
      message: `shared root src/ui/f${index}.ts → slice features/s${index} (src/features/s${index}/x.ts). The wall is direct-only.`,
    }));
    const logged = [];
    const original = console.log;
    console.log = (line) => logged.push(String(line));
    try {
      printSharedImportsSliceBridgeList(warnings);
    } finally {
      console.log = original;
    }
    const edgeLines = logged.filter((line) => line.includes('shared root '));
    expect(edgeLines).toHaveLength(4);
    expect(edgeLines.join('\n')).toContain('src/ui/f3.ts');
    expect(logged.join('\n')).not.toContain('ark-check --json');
    expect(logged.join('\n')).toContain('Shared-root → slice bridges (4):');
  });

  it('baselineOccurrenceKeys ratchets duplicates', () => {
    const v = { ruleId: 'X', file: 'a.ts', fromLayer: 'A', toLayer: 'B', target: 't' };
    expect(baselineKey(v)).toContain('X|a.ts');
    expect(baselineOccurrenceKeys([v, v])).toEqual([baselineKey(v), `${baselineKey(v)}#2`]);
  });
});

describe('doctor-plan computeCoverage (shipped)', () => {
  it('classifies files and reports emptyScope honestly for zero files', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-cov-'));
    try {
      const config = {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
        ],
      };
      const empty = computeCoverage(root, config, [], [
        { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
      ]);
      expect(empty.emptyScope).toBe(true);
      expect(empty.governed.percent).toBe(0);

      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      const domainFile = path.join(root, 'src/domain/x.ts');
      fs.writeFileSync(domainFile, 'export const x = 1;\n');
      const withFiles = computeCoverage(root, config, [domainFile], [
        { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
      ]);
      expect(withFiles.totalFiles).toBe(1);
      expect(withFiles.layers.find((l) => l.name === 'DomainModel')?.files).toBe(1);
      expect(withFiles.governed.percent).toBe(100);
      expect(withFiles.emptyLayers).toContain('ApplicationOrchestration');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
