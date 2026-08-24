import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  HTML_REPORT_VIOLATION_LIST_CAP,
  renderBeginnerHtmlReport,
  renderHtmlReport,
} from '../../../bin/lib/html-report.mjs';

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-html-cap-'));
}

const coverage = {
  governed: { percent: 80, classifiedFiles: 8, totalFiles: 10 },
  layers: [],
  unclassified: { count: 0, files: [] },
  emptyLayers: [],
  layersWithoutRules: [],
  suggestions: [],
  include: ['src'],
};

const config = {
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
};

function fifteenViolations() {
  return Array.from({ length: 15 }, (_, i) => ({
    ruleId: 'LAYER_IMPORT_VIOLATION',
    file: `src/file-${i}.ts`,
    line: i + 1,
    fromLayer: 'DomainModel',
    toLayer: 'PersistenceAdapters',
    message: `violation ${i}`,
  }));
}

describe('html-report violation list cap', () => {
  it('caps the showcase table, keeps KPI/rule totals at 15, and shows remainder', () => {
    expect(HTML_REPORT_VIOLATION_LIST_CAP).toBe(12);
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'cap-demo' }));
      const html = renderHtmlReport({
        root,
        config,
        coverage,
        violations: fifteenViolations(),
        ok: false,
        version: 'test',
        configPath: 'ark.config.json',
        generatedAt: '2026-08-24',
      });
      expect(html).toContain('src/file-0.ts');
      expect(html).toContain('src/file-11.ts');
      expect(html).not.toContain('src/file-12.ts');
      expect(html).not.toContain('src/file-14.ts');
      expect(html).toContain('+3 more (15 total)');
      expect(html).toMatch(/<b>15<\/b>\s*<span>Violations<\/span>/);
      expect(html).toMatch(
        /<span class="rule">LAYER_IMPORT_VIOLATION<\/span>\s*<span class="dim">15<\/span>/
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('caps the beginner list and shows the same remainder note', () => {
    const root = mk();
    try {
      fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'cap-demo' }));
      const html = renderBeginnerHtmlReport({
        root,
        config,
        violations: fifteenViolations(),
        ok: false,
        version: 'test',
        configPath: 'ark.config.json',
        generatedAt: '2026-08-24',
      });
      expect(html).toContain('src/file-0.ts');
      expect(html).toContain('src/file-11.ts');
      expect(html).not.toContain('src/file-12.ts');
      expect(html).toContain('+3 more (15 total)');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
