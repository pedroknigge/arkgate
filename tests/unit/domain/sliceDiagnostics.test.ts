/**
 * Slice findings on every surface: reasonId + universe pair + per-reason hint
 * in adapter diagnostics, the write gate's explanation for fail-closed
 * reasons, the inner-wall message, and the pin-evidence version floor (#338).
 * The generated CLI copies are held byte-identical by check:cli-pure.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createAdapterResult, toAdapterDiagnostic } from '../../../src/domain/adapterContract';
import {
  DIAGNOSTIC_RULE_IDS,
  sliceReasonHint,
  SLICE_REASON_HINTS,
} from '../../../src/domain/diagnosticCatalog';
import { deterministicNextAction, enrichViolationWithFixClass } from '../../../src/domain/remediation';
import {
  ARKGATE_CONFIG_KEY_FLOORS,
  compareArkgateVersion,
  configVersionFloors,
  configVersionPinFindings,
  parseArkgatePins,
} from '../../../src/domain/configVersionFloor';
import { collectAnalysisConfigWarnings } from '../../../src/kernel/configWarnings';
import { createAICodeGate } from '../../../src/index';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));

describe('slice reason on adapter diagnostics', () => {
  const sibling = {
    ruleId: 'LAYER_IMPORT_VIOLATION',
    file: 'src/lib/features/projects/scm/sibling.ts',
    line: 1,
    fromLayer: 'Application',
    toLayer: 'Application',
    target: 'src/lib/features/projects/rfi/service.ts',
    peerIsolation: true,
    reasonId: 'CROSS_SIBLING_SLICE',
    universeFrom: 'projects',
    universeTo: 'projects',
    message: 'cross-sibling',
  };

  it('keeps reasonId + universe pair in evidence and uses the reason hint', () => {
    const diagnostic = toAdapterDiagnostic(sibling);
    expect(diagnostic.evidence).toMatchObject({
      reasonId: 'CROSS_SIBLING_SLICE',
      universeFrom: 'projects',
      universeTo: 'projects',
    });
    expect(diagnostic.nextAction).toBe(`${sliceReasonHint('CROSS_SIBLING_SLICE')!.fix} Then preflight again.`);
  });

  it('reads the reason from gate details and keeps it out of the baseline key', () => {
    const { reasonId, universeFrom, universeTo, ...rest } = sibling;
    void universeFrom;
    void universeTo;
    const fromDetails = toAdapterDiagnostic({ ...rest, details: { reasonId } } as never);
    expect(fromDetails.evidence.reasonId).toBe('CROSS_SIBLING_SLICE');
    expect(fromDetails.targetKey).toBe(toAdapterDiagnostic(sibling).targetKey);
    expect(toAdapterDiagnostic({ ...rest, reasonId: 'NOT_A_SLICE_REASON' }).evidence.reasonId).toBeUndefined();
  });

  it('every slice reason has its own next action and enrich hint', () => {
    for (const hint of SLICE_REASON_HINTS) {
      expect(deterministicNextAction({ ruleId: 'LAYER_IMPORT_VIOLATION', reasonId: hint.reasonId })).toContain(
        hint.fix
      );
      expect(
        enrichViolationWithFixClass({ ruleId: 'LAYER_IMPORT_VIOLATION', reasonId: hint.reasonId, peerIsolation: true })
          .enthusiastHint
      ).toContain(hint.why);
    }
    expect(sliceReasonHint('CROSS_PARENT_VIA_SHARED')?.fix).toContain('stopAt');
  });
});

describe('write gate on slice denies', () => {
  const layers = [{ name: 'Application', patterns: ['src/lib/**'] }];
  const place = (spec: string): { layer: string; relPath: string } | undefined => {
    if (spec.endsWith('a/x.ts')) return { layer: 'Application', relPath: 'src/lib/features/a/x.ts' };
    if (spec.includes('misc/m')) return { layer: 'Application', relPath: 'src/lib/misc/m.ts' };
    if (spec.includes('b/y')) return { layer: 'Application', relPath: 'src/lib/features/b/y.ts' };
    if (spec.includes('rfi/service')) {
      return { layer: 'Application', relPath: 'src/lib/features/projects/rfi/service.ts' };
    }
    if (spec.includes('scm/new')) return { layer: 'Application', relPath: 'src/lib/features/projects/scm/new.ts' };
    return undefined;
  };
  const gateFor = (rule: Record<string, unknown>) =>
    createAICodeGate({
      architectureProfile: { name: 'p', layers: [{ name: 'Application', prefixes: [] }], rules: [rule] } as never,
      architectureLayers: layers,
      resolveImportTarget: place,
    });
  const universe = {
    from: 'Application',
    to: 'Application',
    allowed: false,
    peerIsolation: true,
    sliceFolders: ['features'],
    message: 'Universe wall: never import another universe.',
  };
  const denied = (rule: Record<string, unknown>, source: string, filePath: string) =>
    gateFor(rule)
      .validate(source, { layer: 'Application', filePath })
      .violations.find((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');

  it('an unclassifiable path names that fact and asks for placement, not extraction', () => {
    const row = denied(universe, "import { m } from '../../misc/m';\n", 'src/lib/features/a/x.ts');
    expect(row?.message).toContain('unclassifiable path (src/lib/misc/m.ts)');
    expect(row?.suggestion).toContain('sharedRoots');
    expect(row?.peerIsolation).toBe(true);
  });

  it("a plain cross-slice deny keeps today's sentence", () => {
    const row = denied(universe, "import { y } from '../b/y';\n", 'src/lib/features/a/x.ts');
    expect(row?.message).toBe(universe.message);
  });

  it('a sibling crossing does not reuse the universe message and carries the reason', () => {
    const rule = {
      ...universe,
      childSlices: { sliceFolders: ['lib/features/*/*'], sliceIdentity: 'stars', siblings: 'deny' },
    };
    const row = denied(rule, "import { s } from '../rfi/service';\n", 'src/lib/features/projects/scm/new.ts');
    expect(row?.message).not.toContain('Universe wall');
    expect(row?.message).toContain('cross-sibling slice features/projects/scm → features/projects/rfi');
    expect(row).toMatchObject({ reasonId: 'CROSS_SIBLING_SLICE', universeFrom: 'projects', universeTo: 'projects' });
    const inner = denied(
      { ...rule, childSlices: { ...rule.childSlices, message: 'Inner wall text.' } },
      "import { s } from '../rfi/service';\n",
      'src/lib/features/projects/scm/new.ts'
    );
    expect(inner?.message.startsWith('Inner wall text.')).toBe(true);
  });
});

describe('config version floor needs pin evidence (#338)', () => {
  const childRule = { childSlices: { sliceFolders: ['lib/features/*/*'] } };

  it('floors per key', () => {
    expect(configVersionFloors([{}])).toBeNull();
    expect(configVersionFloors([childRule])).toEqual({ keys: ['childSlices'], required: '4.8.23' });
    expect(configVersionFloors([{ sliceIdentity: 'stars' }])?.required).toBe('4.8.21');
    expect(configVersionFloors([{ sharedImportsSlice: 'deny' }])?.required).toBe('4.8.20');
    expect(configVersionFloors([{ sharedImportsSlice: 'deny-cross-parent' }])?.required).toBe('4.8.23');
    expect(configVersionFloors([{ sliceIdentity: 'stars', ...childRule }])?.required).toBe('4.8.23');
    const newest = ARKGATE_CONFIG_KEY_FLOORS[0]?.minVersion ?? '';
    expect(
      configVersionFloors([{ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt: ['a'] } }])?.required
    ).toBe(newest);
    expect(compareArkgateVersion(newest, '4.8.23')).toBe(1);
  });

  it('compares the numeric core', () => {
    expect(compareArkgateVersion('4.8.9', '4.8.23')).toBe(-1);
    expect(compareArkgateVersion('v4.8.23', '4.8.23')).toBe(0);
    expect(compareArkgateVersion('4.8.23-rc.1', '4.8.23')).toBe(0);
  });

  it('parses exact package.json pins only', () => {
    const pkg = (spec: string) => JSON.stringify({ name: 'app', devDependencies: { arkgate: spec } }, null, 2);
    expect(parseArkgatePins('package.json', pkg('4.8.22'), 'package-json')).toEqual([
      { file: 'package.json', line: 4, version: '4.8.22', source: 'package-json' },
    ]);
    for (const spec of ['^4.8.0', '~4.8.22', 'latest', 'file:../x.tgz', '*']) {
      expect(parseArkgatePins('package.json', pkg(spec), 'package-json')).toEqual([]);
    }
    expect(
      parseArkgatePins(
        'package.json',
        JSON.stringify({ name: 'arkgate', version: '4.8.1', devDependencies: { arkgate: '4.8.1' } }),
        'package-json'
      )
    ).toEqual([]);
    const withScript = JSON.stringify({ name: 'app', scripts: { ark: 'npx arkgate@4.8.22 ark-check' } }, null, 2);
    expect(parseArkgatePins('package.json', withScript, 'package-json')).toEqual([
      { file: 'package.json', line: 4, version: '4.8.22', source: 'package-json' },
    ]);
  });

  it('parses hooks, workflows, lockfiles, and the installed copy', () => {
    expect(
      parseArkgatePins('scripts/ark-write-hook.sh', '#!/bin/sh\nexec npx -y arkgate@4.8.22 ark-mcp --hook\n', 'hook')
    ).toEqual([{ file: 'scripts/ark-write-hook.sh', line: 2, version: '4.8.22', source: 'hook' }]);
    expect(parseArkgatePins('x.sh', 'npx @arkgate/runtime@1.0.0\n', 'hook')).toEqual([]);
    const workflow =
      'jobs:\n  ark:\n    steps:\n      - uses: actions/checkout@v4\n      - uses: pedroknigge/arkgate@v4.8.22\n';
    expect(parseArkgatePins('.github/workflows/ark.yml', workflow, 'ci')).toEqual([
      { file: '.github/workflows/ark.yml', line: 5, version: '4.8.22', source: 'ci' },
    ]);
    expect(parseArkgatePins('w.yml', '      - uses: pedroknigge/arkgate@v4\n', 'ci')).toEqual([]);
    const input =
      'steps:\n  - name: Ark\n    uses: pedroknigge/arkgate@main\n    with:\n      version: 4.8.20\n  - run: echo\n    with:\n      version: 1.0.0\n';
    expect(parseArkgatePins('w.yml', input, 'ci')).toEqual([
      { file: 'w.yml', line: 5, version: '4.8.20', source: 'ci' },
    ]);
    const lock = JSON.stringify({ packages: { 'node_modules/arkgate': { version: '4.8.22' } } }, null, 2);
    expect(parseArkgatePins('package-lock.json', lock, 'package-lock')[0]?.version).toBe('4.8.22');
    expect(
      parseArkgatePins(
        'node_modules/arkgate/package.json',
        JSON.stringify({ name: 'arkgate', version: '4.8.22' }),
        'installed'
      )[0]?.version
    ).toBe('4.8.22');
  });

  it('is silent without evidence or with current pins; names the file and target otherwise', () => {
    const rules = [childRule];
    expect(configVersionPinFindings({ rules, pins: undefined })).toEqual([]);
    expect(configVersionPinFindings({ rules, pins: [] })).toEqual([]);
    const current = { file: 'package.json', line: 4, version: '4.8.23', source: 'package-json' as const };
    expect(configVersionPinFindings({ rules, pins: [current], runningVersion: '4.8.24' })).toEqual([]);
    const stale = { file: '.github/workflows/ark.yml', line: 5, version: '4.8.22', source: 'ci' as const };
    const [row] = configVersionPinFindings({ rules, pins: [stale, stale] });
    expect(row).toMatchObject({ ruleId: 'CONFIG_CHILD_SLICES_VERSION', path: stale.file, line: 5, failsStrict: false });
    expect(row?.message).toContain('childSlices');
    expect(row?.message).toContain('4.8.22');
    expect(row?.nextAction).toBe(
      'Bump arkgate in .github/workflows/ark.yml from 4.8.22 to 4.8.23, then run Ark again.'
    );
    expect(configVersionPinFindings({ rules, pins: [stale], runningVersion: '4.8.30' })[0]?.nextAction).toContain(
      'to 4.8.30'
    );
    expect(
      configVersionPinFindings({ rules, pins: [stale, { ...stale, file: 'a.sh', source: 'hook' }] }).map(
        (entry) => entry.path
      )
    ).toEqual(['.github/workflows/ark.yml', 'a.sh']);
    // Keys newer than 4.8.23: the running build caps the floor, so a pin equal to it is never stale.
    const stopAt = [{ sharedImportsSlice: { mode: 'deny-cross-parent', stopAt: ['kernel/bootstrap.ts'] } }];
    const pinned = { ...stale, version: '4.8.23' };
    expect(configVersionPinFindings({ rules: stopAt, pins: [pinned], runningVersion: '4.8.23' })).toEqual([]);
    expect(configVersionPinFindings({ rules: stopAt, pins: [pinned], runningVersion: '4.9.0' })[0]?.message).toContain(
      'sharedImportsSlice.stopAt'
    );
    const identity = [{ sliceIdentity: 'stars' }];
    expect(configVersionPinFindings({ rules: identity, pins: [{ ...stale, version: '4.8.20' }] })).toHaveLength(1);
    expect(configVersionPinFindings({ rules: identity, pins: [{ ...stale, version: '4.8.21' }] })).toEqual([]);
  });

  it('config warnings and the adapter point at the pin', () => {
    const config = {
      include: ['src'],
      layers: [{ name: 'Application', patterns: ['src/**'] }],
      rules: [
        {
          from: 'Application',
          to: 'Application',
          allowed: false,
          peerIsolation: true,
          sliceFolders: ['features'],
          ...childRule,
        },
      ],
    };
    const base = { config: config as never, rules: config.rules as never, files: [] };
    expect(collectAnalysisConfigWarnings(base).some((w) => w.ruleId === 'CONFIG_CHILD_SLICES_VERSION')).toBe(false);
    const warnings = collectAnalysisConfigWarnings({
      ...base,
      arkgatePins: [{ file: 'package.json', line: 4, version: '4.8.22', source: 'package-json' }],
    });
    const row = warnings.find((w) => w.ruleId === 'CONFIG_CHILD_SLICES_VERSION');
    expect(row).toMatchObject({ file: 'package.json', line: 4, failsStrict: false });
    const diagnostic = toAdapterDiagnostic(row as never, 'warning');
    expect(diagnostic.location.file).toBe('package.json');
    expect(diagnostic.nextAction?.startsWith('Bump arkgate in package.json')).toBe(true);
    expect(typeof createAdapterResult).toBe('function');
  });
});

describe('every emitted ruleId literal is catalogued', () => {
  /** Internal placeholders that are never a check diagnostic. */
  const INTERNAL = new Map([
    ['ARCHITECTURE_CHECK', 'upgrade report placeholder when ark-check is red without a parseable rule id'],
  ]);

  function walk(dir: string, out: string[]): void {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, out);
      else if (/\.(ts|mjs)$/.test(entry.name)) out.push(full);
    }
  }

  it('scans src/**/*.ts and bin/**/*.mjs for ruleId literals and *_RULE_ID constants', () => {
    const files: string[] = [];
    walk(path.join(REPO_ROOT, 'src'), files);
    walk(path.join(REPO_ROOT, 'bin'), files);
    const known = new Set(DIAGNOSTIC_RULE_IDS);
    const missing = new Set<string>();
    for (const file of files) {
      if (file.endsWith('analysis-engine.mjs')) continue; // minified bundle of src/
      const text = fs.readFileSync(file, 'utf8');
      const patterns = [/ruleId:\s*'([A-Z][A-Z0-9_]+)'/g, /_RULE_ID\s*=\s*'([A-Z][A-Z0-9_]+)'/g];
      for (const pattern of patterns) {
        for (const match of text.matchAll(pattern)) {
          const id = match[1] ?? '';
          if (!known.has(id) && !INTERNAL.has(id)) missing.add(`${id} (${path.relative(REPO_ROOT, file)})`);
        }
      }
    }
    expect([...missing].sort()).toEqual([]);
  });
});
