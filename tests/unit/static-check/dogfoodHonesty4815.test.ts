/**
 * 4.8.15 dogfood honesty: #243 glyph vs exit, #246 start refuse pointers,
 * #247 one projected governed coverage definition.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  START_APPLY_REFUSE_FOOTER,
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  evaluateStartShapeConfidenceGate,
  formatArchitectureRecommendationHuman,
  resolveStartInitPreset,
} from '../../../bin/ark-shared.mjs';
import {
  measureGovernedCoverage,
  measureProjectedGovernedCoverage,
  starterConfigForPreset,
  withProjectedGovernedCoverage,
} from '../../../bin/lib/projected-governed-coverage.mjs';
import { printViolation, violationMark } from '../../../bin/lib/violations.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const README = fs.readFileSync(path.resolve('README.md'), 'utf8');
const USE_MD = fs.readFileSync(path.resolve('docs/use.md'), 'utf8');

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeFile(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
}

/** Brownfield-ish tree: files under src/ but only some match hexagonal globs. */
function seedPartialHexagonalTree(root: string) {
  writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'dogfood-partial',
      version: '0.0.0',
      dependencies: { react: '^19.0.0', prisma: '^6.0.0' },
    })
  );
  writeFile(path.join(root, 'src/domain/order.ts'), 'export type Order = { id: string };\n');
  writeFile(path.join(root, 'src/persistence/db.ts'), 'export const db = {};\n');
  writeFile(path.join(root, 'src/components/List.tsx'), 'export const List = () => null;\n');
  writeFile(path.join(root, 'src/utils/fmt.ts'), 'export const fmt = (s: string) => s;\n');
  writeFile(path.join(root, 'src/hooks/useOrder.ts'), 'export const useOrder = () => null;\n');
}

describe('#243 type-only placement debt glyph matches exit 0', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses ⚠ for failsStrict:false and ✖ for blocking findings', () => {
    expect(violationMark({ failsStrict: false, ruleId: 'LAYER_IMPORT_VIOLATION' })).toBe('⚠');
    expect(violationMark({ ruleId: 'LAYER_IMPORT_VIOLATION' })).toBe('✖');
    expect(violationMark({ failsStrict: true, ruleId: 'LAYER_IMPORT_VIOLATION' })).toBe('✖');
  });

  it('printViolation paints ⚠ (not ✖) for non-blocking type-only debt', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((value = '') => {
      lines.push(String(value));
    });
    printViolation({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      file: 'src/app/types.ts',
      line: 1,
      fromLayer: 'App',
      toLayer: 'Kernel',
      message: 'type placement',
      typeOnly: true,
      failsStrict: false,
    });
    const text = lines.join('\n');
    expect(text).toContain('⚠');
    expect(text).toContain('LAYER_IMPORT_VIOLATION');
    expect(text).not.toContain('✖');
  });

  it('CLI type-only-only path exits 0, prints ⚠ + passed (not ✖ on the finding)', () => {
    const root = mkTemp('ark-df243-');
    try {
      writeFile(path.join(root, 'src/kernel/api.ts'), 'export type Api = number;\nexport const api = 1;\n');
      writeFile(
        path.join(root, 'src/app/types.ts'),
        "import type { Api } from '../kernel/api';\nexport const x: Api = 1;\n"
      );
      writeFile(
        path.join(root, 'ark.config.json'),
        JSON.stringify({
          include: ['src'],
          layers: [
            { name: 'AppOrchestration', patterns: ['src/app/**'] },
            { name: 'Kernel', patterns: ['src/kernel/**'] },
          ],
          rules: [{ from: 'AppOrchestration', to: 'Kernel', allowed: false }],
        })
      );
      const human = spawnSync(process.execPath, [ARK_CHECK, '--root', root, '--config', 'ark.config.json'], {
        encoding: 'utf8',
      });
      const out = `${human.stdout}${human.stderr}`;
      expect(human.status, out).toBe(0);
      expect(out).toMatch(/⚠\s+LAYER_IMPORT_VIOLATION/);
      expect(out).toMatch(/passed with 1 type-only placement debt/i);
      expect(out).not.toMatch(/✖\s+LAYER_IMPORT_VIOLATION/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('#246 start --apply refuse pointers stay on the one-minute path', () => {
  it('README and use.md name the deliberate lock flags', () => {
    for (const text of [README, USE_MD]) {
      expect(text).toMatch(/start --apply/);
      expect(text).toMatch(/--archetype/);
      expect(text).toMatch(/--preset/);
      expect(text).toMatch(/--force/);
      expect(text).toMatch(/arkgate-check --recommend|ark-check --recommend/);
      expect(text).toMatch(/deliberate|refuses/);
    }
  });

  it('refuse gate choices and preview footer name the same lock flags', () => {
    const gate = evaluateStartShapeConfidenceGate({
      confidence: 0.4,
      projectedCoveragePercent: 36,
      totalFiles: 94,
    });
    expect(gate.ok).toBe(false);
    const blob = `${(gate as { choices?: string[] }).choices?.join('\n')}\n${START_APPLY_REFUSE_FOOTER}`;
    expect(blob).toMatch(/--archetype/);
    expect(blob).toMatch(/--preset/);
    expect(blob).toMatch(/--force/);
    expect(blob).toMatch(/--recommend/);
  });

  it('recommend firstCommand is start --apply --archetype, not ark init', () => {
    const root = mkTemp('ark-df246-cmd-');
    try {
      seedPartialHexagonalTree(root);
      const rec = withProjectedGovernedCoverage(buildArchitectureRecommendation(root), root);
      expect(rec.firstCommand).toMatch(/start --apply --archetype /);
      expect(rec.firstCommand).not.toMatch(/init --archetype/);
      expect(formatArchitectureRecommendationHuman(rec)).toMatch(/start --apply --archetype /);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('#247 one projected governed coverage definition', () => {
  it('recommend, starter computeCoverage, and doctor helper agree; discovered-source may differ', () => {
    const root = mkTemp('ark-df247-');
    try {
      seedPartialHexagonalTree(root);
      const raw = buildArchitectureRecommendation(root);
      const rec = withProjectedGovernedCoverage(raw, root);
      const preset = resolveStartInitPreset(root, rec);
      expect(preset).toBeTruthy();
      const starter = starterConfigForPreset(root, preset!);
      expect(starter).toBeTruthy();
      const fromHelper = measureProjectedGovernedCoverage(root, rec);
      const fromStarter = measureGovernedCoverage(root, starter!);
      expect(fromHelper.percent).toBe(fromStarter.governed.percent);
      expect(rec.signals.projectedGovernedCoverage).toBe(fromStarter.governed.percent);
      expect(rec.projectedCoverage.percent).toBe(fromStarter.governed.percent);
      expect(rec.projectedCoverage.classifiedFiles).toBe(fromStarter.governed.classifiedFiles);
      expect(rec.projectedCoverage.totalFiles).toBe(fromStarter.governed.totalFiles);

      const discovered = collectRepoShapeSignals(root).discoveredSourceCoverage;
      expect(discovered).toBeGreaterThan(fromStarter.governed.percent);
      expect(formatArchitectureRecommendationHuman(rec)).toContain(
        `Projected governed coverage: ${fromStarter.governed.percent}%`
      );

      writeFile(path.join(root, 'ark.config.json'), `${JSON.stringify(starter, null, 2)}\n`);
      const doctorish = measureGovernedCoverage(root, JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8')));
      const withConfig = measureProjectedGovernedCoverage(root, rec);
      expect(withConfig.percent).toBe(fromStarter.governed.percent);
      expect(withConfig.source).toBe('existing-config');
      expect(doctorish.governed.percent).toBe(fromStarter.governed.percent);

      const cli = JSON.parse(
        execFileSync(process.execPath, [ARK_CHECK, '--root', root, '--recommend', '--json'], {
          encoding: 'utf8',
        })
      ) as { signals: { projectedGovernedCoverage: number }; projectedCoverage: { percent: number } };
      expect(cli.signals.projectedGovernedCoverage).toBe(fromStarter.governed.percent);
      expect(cli.projectedCoverage.percent).toBe(fromStarter.governed.percent);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
