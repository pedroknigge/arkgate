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
