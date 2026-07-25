/**
 * Field gap closure S3 — classification / start / adopt / P0-A retrofit.
 * Gap IDs: NEW-APP-VACUUM-LIB, DL-DOMAIN-SPECIFICITY, NEW-SPA-DEFAULT-LAYOUT,
 * NEW-ADOPT-LIB-AS-PRESENTATION, NEW-START-LOW-CONFIDENCE-SHAPE, DL-P0A-RETROFIT,
 * P0A-DUAL-MATCH, DL-START-APPLY-MESSAGE (messaging unit-covered via start-preview).
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  layerForRelativePath,
  matchingLayersForRelativePath,
  patternSpecificity,
} from '../../../src/domain/layerMatch';
import { applyFrameworkLayoutOverlays, evaluateStartShapeConfidenceGate } from '../../../bin/ark-shared.mjs';
import {
  ARCHITECTURE_PRESETS,
  retrofitP0aApiApplicationPatterns,
  NEXT_API_APPLICATION_PATTERNS,
} from '../../../bin/lib/presets.mjs';
import {
  suggestLayerForPath,
  isPersistenceClientPath,
} from '../../../bin/lib/suggestions.mjs';
import { computeCoverage } from '../../../bin/lib/doctor-plan.mjs';
import { renderStartPreview } from '../../../bin/lib/start-preview.mjs';

const CHECK = path.resolve('bin/ark-check.mjs');
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-s3-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const t of temps.splice(0)) {
    try {
      fs.rmSync(t, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

describe('S3.1 layerMatch path-anchored specificity (DL-DOMAIN-SPECIFICITY)', () => {
  it('**/domain/** beats Application src/lib/** vacuum for domain files', () => {
    const layers = [
      { name: 'ApplicationOrchestration', patterns: ['src/lib/**'] },
      { name: 'DomainModel', patterns: ['**/domain/**', '**/kernel/domain/**'] },
    ];
    expect(layerForRelativePath('src/lib/domain/entity.ts', layers)).toBe('DomainModel');
    expect(layerForRelativePath('src/kernel/domain/policy.ts', layers)).toBe('DomainModel');
    // Non-domain under lib still Application when only those patterns exist.
    expect(layerForRelativePath('src/lib/utils.ts', layers)).toBe('ApplicationOrchestration');
    expect(patternSpecificity('**/domain/**', 'src/lib/domain/x.ts')).toBeGreaterThan(
      patternSpecificity('src/lib/**', 'src/lib/domain/x.ts')
    );
  });

  it('**/repositories/** and **/supabase/** beat broad Application bags', () => {
    const layers = [
      { name: 'ApplicationOrchestration', patterns: ['src/lib/**'] },
      {
        name: 'PersistenceAdapters',
        patterns: ['**/repositories/**', '**/supabase/**', 'src/lib/db/**'],
      },
    ];
    expect(layerForRelativePath('src/lib/repositories/user.ts', layers)).toBe('PersistenceAdapters');
    expect(layerForRelativePath('src/lib/supabase/client.ts', layers)).toBe('PersistenceAdapters');
    expect(layerForRelativePath('src/lib/db/pool.ts', layers)).toBe('PersistenceAdapters');
  });

  it('Next API high-spec beats Presentation **/app/**', () => {
    const layers = [
      { name: 'PresentationAdapters', patterns: ['src/app/**', '**/app/**'] },
      { name: 'ApplicationOrchestration', patterns: [...NEXT_API_APPLICATION_PATTERNS] },
    ];
    expect(layerForRelativePath('src/app/api/orders/route.ts', layers)).toBe(
      'ApplicationOrchestration'
    );
    expect(layerForRelativePath('src/app/page.tsx', layers)).toBe('PresentationAdapters');
  });
});

describe('S3.1 presets — no Application vacuum / SPA layout', () => {
  it('Next overlay never uses bare src/lib/** as Application', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { next: '15.0.0', react: '19.0.0' } })
    );
    fs.mkdirSync(path.join(root, 'src/lib/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/domain/money.ts'), 'export const x = 1;\n');
    fs.mkdirSync(path.join(root, 'src/lib/repositories'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/repositories/u.ts'), 'export const r = 1;\n');
    fs.mkdirSync(path.join(root, 'src/lib/utils'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/lib/utils/fmt.ts'), 'export const f = 1;\n');

    const base = ARCHITECTURE_PRESETS['ui-surface']([], root);
    const cfg = applyFrameworkLayoutOverlays(base, root);
    const app = cfg.layers.find((l: { name: string }) => l.name === 'ApplicationOrchestration');
    expect(app?.patterns ?? []).not.toContain('src/lib/**');
    expect(app?.patterns ?? []).not.toContain('src/**');

    expect(layerForRelativePath('src/lib/domain/money.ts', cfg.layers)).toBe('DomainModel');
    expect(layerForRelativePath('src/lib/repositories/u.ts', cfg.layers)).toBe(
      'PersistenceAdapters'
    );
  });

  it('monorepo preset never maps bare **/lib/** to Presentation', () => {
    const cfg = ARCHITECTURE_PRESETS.monorepo([], undefined);
    const pres = cfg.layers.find((l: { name: string }) => l.name === 'PresentationAdapters');
    expect(pres?.patterns ?? []).not.toContain('**/lib/**');
    expect(layerForRelativePath('packages/core/src/domain/x.ts', cfg.layers)).toBe('DomainModel');
    expect(layerForRelativePath('apps/web/src/lib/supabase/client.ts', cfg.layers)).toBe(
      'PersistenceAdapters'
    );
  });

  it('vite-vercel-spa includes src,api,lib and classifies SPA layout', () => {
    const root = mk();
    fs.writeFileSync(
      path.join(root, 'package.json'),
      JSON.stringify({ dependencies: { vite: '6.0.0', react: '19.0.0' } })
    );
    fs.writeFileSync(path.join(root, 'vite.config.ts'), 'export default {}\n');
    for (const dir of ['src', 'api', 'lib']) fs.mkdirSync(path.join(root, dir), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/main.jsx'), 'export default {}\n');
    fs.writeFileSync(path.join(root, 'api/hello.js'), 'export default {}\n');
    fs.writeFileSync(path.join(root, 'lib/turso.js'), 'export const db = {}\n');

    const cfg = ARCHITECTURE_PRESETS['vite-vercel-spa']([], root);
    expect(cfg.include).toEqual(expect.arrayContaining(['src', 'api', 'lib']));
    expect(layerForRelativePath('api/hello.js', cfg.layers)).toBe('ApplicationOrchestration');
    expect(layerForRelativePath('lib/turso.js', cfg.layers)).toBe('PersistenceAdapters');
    expect(layerForRelativePath('src/main.jsx', cfg.layers)).toBe('PresentationAdapters');
  });
});

describe('S3.1 start confidence gate (NEW-START-LOW-CONFIDENCE-SHAPE)', () => {
  it('refuses weak coverage and low-conf incomplete shapes; allows high-cover thin packages', () => {
    // superinsights-class: low conf + 0% cover
    expect(
      evaluateStartShapeConfidenceGate({ confidence: 0.49, projectedCoveragePercent: 0 }).ok
    ).toBe(false);
    // low conf + mediocre cover
    expect(
      evaluateStartShapeConfidenceGate({ confidence: 0.49, projectedCoveragePercent: 40 }).ok
    ).toBe(false);
    // coverage alone under 50%
    expect(
      evaluateStartShapeConfidenceGate({ confidence: 0.9, projectedCoveragePercent: 20 }).ok
    ).toBe(false);
    // thin library: low conf but 100% cover — allow (B01)
    expect(
      evaluateStartShapeConfidenceGate({ confidence: 0.28, projectedCoveragePercent: 100 }).ok
    ).toBe(true);
    expect(
      evaluateStartShapeConfidenceGate({ confidence: 0.8, projectedCoveragePercent: 80 }).ok
    ).toBe(true);
    expect(
      evaluateStartShapeConfidenceGate({
        confidence: 0.2,
        projectedCoveragePercent: 10,
        force: true,
      }).ok
    ).toBe(true);
    expect(
      evaluateStartShapeConfidenceGate({
        confidence: 0.2,
        projectedCoveragePercent: 10,
        explicitShape: true,
      }).ok
    ).toBe(true);
  });
});

describe('S3.1 start apply messaging (DL-START-APPLY-MESSAGE)', () => {
  it('applying path does not claim preview-no-write', () => {
    const logs: string[] = [];
    const orig = console.log;
    console.log = (...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    };
    try {
      renderStartPreview(
        {
          analysis: { label: 'demo', archetype: 'crud-product', confidence: 0.7 },
          projectedCoverage: { percent: 80, classifiedFiles: 8, totalFiles: 10 },
          setupBudget: { files: 2, gateFiles: 2, arkrulesFiles: 0, bytes: 100, maxFiles: 8, maxBytes: 32000, ok: true },
          changes: [{ action: 'create', path: 'ark.config.json', afterHash: 'sha256:x' }],
          commands: [],
          hostGuarantees: [],
          unresolvedDecisions: [],
        },
        { applying: true }
      );
    } finally {
      console.log = orig;
    }
    const text = logs.join('\n');
    expect(text).not.toMatch(/no files were changed/i);
    expect(text).toMatch(/writing 1 planned mutation/i);
  });
});

describe('S3.2 adopt heuristics (NEW-ADOPT-LIB-AS-PRESENTATION)', () => {
  it('maps turso/prisma/supabase/auth clients to Persistence, not Presentation', () => {
    expect(isPersistenceClientPath('lib/turso.js')).toBe(true);
    expect(suggestLayerForPath('lib/turso')).toMatchObject({ layer: 'PersistenceAdapters' });
    expect(suggestLayerForPath('lib/prisma')).toMatchObject({ layer: 'PersistenceAdapters' });
    expect(suggestLayerForPath('src/lib/supabase')).toMatchObject({
      layer: 'PersistenceAdapters',
    });
    expect(suggestLayerForPath('src/lib/auth')).toMatchObject({ layer: 'PersistenceAdapters' });
  });

  it('never maps bare lib solely to Presentation', () => {
    expect(suggestLayerForPath('lib')).toBeNull();
    expect(suggestLayerForPath('src/lib')).toBeNull();
  });

  it('discover domain folders under kernel', () => {
    expect(suggestLayerForPath('src/kernel/domain')).toMatchObject({ layer: 'DomainModel' });
    expect(suggestLayerForPath('packages/core/domain')).toMatchObject({ layer: 'DomainModel' });
  });
});

describe('S3.3 P0-A retrofit + dualMembership', () => {
  it('retrofitP0aApiApplicationPatterns injects API globs when missing', () => {
    const old = {
      layers: [
        { name: 'ApplicationOrchestration', patterns: ['src/services/**'] },
        { name: 'PresentationAdapters', patterns: ['src/app/**'] },
      ],
    };
    const result = retrofitP0aApiApplicationPatterns(old);
    expect(result.changed).toBe(true);
    expect(result.injected).toEqual(expect.arrayContaining(['src/app/api/**', '**/app/api/**']));
    expect(layerForRelativePath('src/app/api/health/route.ts', result.config.layers)).toBe(
      'ApplicationOrchestration'
    );
    expect(layerForRelativePath('src/app/page.tsx', result.config.layers)).toBe(
      'PresentationAdapters'
    );
    // Idempotent second pass
    const again = retrofitP0aApiApplicationPatterns(result.config);
    expect(again.changed).toBe(false);
  });

  it('matchingLayersForRelativePath + coverage dualMembership signal', () => {
    const layers = [
      { name: 'ApplicationOrchestration', patterns: ['src/app/api/**'] },
      { name: 'PresentationAdapters', patterns: ['src/app/**'] },
    ];
    const hits = matchingLayersForRelativePath('src/app/api/x/route.ts', layers);
    expect(hits.map((h) => h.layer).sort()).toEqual([
      'ApplicationOrchestration',
      'PresentationAdapters',
    ]);
    expect(hits[0].layer).toBe('ApplicationOrchestration');

    const root = mk();
    const file = path.join(root, 'src/app/api/x/route.ts');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export async function GET() {}\n');
    const page = path.join(root, 'src/app/page.tsx');
    fs.writeFileSync(page, 'export default function Page() { return null }\n');
    const cov = computeCoverage(
      root,
      { include: ['src'], layers, rules: [] },
      [file, page],
      []
    );
    expect(cov.dualMembership.count).toBeGreaterThanOrEqual(1);
    expect(cov.dualMembership.note).toMatch(/multiple layers/i);
    const sample = cov.dualMembership.samples.find((s: { file: string }) =>
      s.file.includes('api')
    );
    expect(sample?.winner).toBe('ApplicationOrchestration');
    expect(sample?.layers).toEqual(
      expect.arrayContaining(['ApplicationOrchestration', 'PresentationAdapters'])
    );
  });

  it('ark-check --migrate-contract --write applies retrofit on disk', () => {
    const root = mk();
    const cfg = {
      include: ['src'],
      layers: [
        { name: 'ApplicationOrchestration', patterns: ['src/services/**'], optional: true },
        { name: 'PresentationAdapters', patterns: ['src/app/**'], optional: true },
      ],
      rules: [],
    };
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(cfg, null, 2));
    fs.mkdirSync(path.join(root, 'src/app/api/h'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/api/h/route.ts'), 'export async function GET() {}\n');

    const dry = spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--migrate-contract', '--json'],
      { encoding: 'utf8' }
    );
    expect(dry.status).toBe(0);
    const dryJ = JSON.parse(dry.stdout);
    expect(dryJ.changed).toBe(true);
    expect(dryJ.wrote).toBe(false);

    const write = spawnSync(
      process.execPath,
      [CHECK, '--root', root, '--migrate-contract', '--write', '--json'],
      { encoding: 'utf8' }
    );
    expect(write.status).toBe(0);
    const written = JSON.parse(fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8'));
    expect(written.layers[0].patterns).toEqual(
      expect.arrayContaining(['src/app/api/**', '**/app/api/**'])
    );
  });
});
