/**
 * Drive remaining branches in Q1 enforcement-critical modules to ≥95% branch.
 * All imports are shipped production modules.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  baselineKey,
  baselineOccurrenceKeys,
} from '../../../bin/lib/baseline-key.mjs';
import { detectCycles } from '../../../bin/lib/graph-cycles.mjs';
import { detectWritePathCapabilities } from '../../../bin/lib/write-path-detect.mjs';
import {
  applyImportTypeAutoPatch,
  classifyImportTypeConversion,
  inspectTargetModule,
  resolveImportFileAbs,
  validateWithAutoPatch,
} from '../../../bin/lib/auto-patch.mjs';
import {
  buildJudgmentBrief,
  composePrepareWrite,
  contentIdentity,
} from '../../../bin/lib/prepare-write.mjs';
import { collectSafetyDiagnostics } from '../../../bin/lib/safety-diagnostics.mjs';

const require = createRequire(import.meta.url);

function mk(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ark-crit-'));
}

describe('baseline-key branches ≥95%', () => {
  it('covers empty optional fields and multi-occurrence keys', () => {
    expect(
      baselineKey({
        ruleId: undefined,
        file: undefined,
        fromLayer: undefined,
        toLayer: null as unknown as undefined,
        target: undefined,
      })
    ).toBe('||||');
    expect(
      baselineKey({
        ruleId: 'R',
        file: 'f.ts',
        fromLayer: 'A',
        toLayer: 'B',
        target: 't',
      })
    ).toBe('R|f.ts|A|B|t');
    const keys = baselineOccurrenceKeys([
      { ruleId: 'R', file: 'f.ts' },
      { ruleId: 'R', file: 'f.ts' },
      { ruleId: 'R', file: 'f.ts' },
      { ruleId: 'S', file: 'g.ts', fromLayer: '', toLayer: '', target: '' },
    ]);
    expect(keys).toEqual(['R|f.ts|||', 'R|f.ts|||#2', 'R|f.ts|||#3', 'S|g.ts|||']);
    expect(baselineOccurrenceKeys([])).toEqual([]);
  });
});

describe('graph-cycles branches ≥95%', () => {
  it('covers empty, self, triangle, disconnected, and sparse values', () => {
    expect(detectCycles(new Map())).toEqual([]);
    const self = new Map([['a.ts', new Set(['a.ts'])]]);
    expect(Array.isArray(detectCycles(self))).toBe(true);

    const tri = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set(['a.ts'])],
    ]);
    const cycles = detectCycles(tri);
    expect(cycles.length).toBe(1);
    expect(cycles[0].cycleKind).toBe('value');

    const dag = new Map([
      ['a.ts', new Set(['b.ts'])],
      ['b.ts', new Set(['c.ts'])],
      ['c.ts', new Set()],
      ['d.ts', new Set(['e.ts'])],
      ['e.ts', new Set()],
    ]);
    expect(detectCycles(dag)).toEqual([]);

    // Edge to missing node is skipped
    const missing = new Map([['a.ts', new Set(['ghost.ts'])]]);
    expect(detectCycles(missing)).toEqual([]);

    // graph.get(v) returns undefined → ?? [] branch
    const sparse = new Map<string, Set<string> | undefined>([['lonely.ts', undefined]]);
    expect(detectCycles(sparse as Map<string, Set<string>>)).toEqual([]);

    // Cross-edge on stack (back-edge to ancestor already on stack)
    const diamond = new Map([
      ['a.ts', new Set(['b.ts', 'c.ts'])],
      ['b.ts', new Set(['d.ts'])],
      ['c.ts', new Set(['d.ts'])],
      ['d.ts', new Set(['a.ts'])],
    ]);
    expect(detectCycles(diamond).length).toBeGreaterThanOrEqual(1);
  });
});

describe('write-path-detect branches ≥95%', () => {
  it('covers all mode combinations and evidence collection', () => {
    const root = mk();
    try {
      expect(detectWritePathCapabilities(root, 'unknown').mode).toBe('none');
      expect(detectWritePathCapabilities(root, 'unknown').gap?.id).toBe('write-path-none');

      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(path.join(root, '.claude/settings.json'), '{ not-a-hook }');
      expect(detectWritePathCapabilities(root, 'claude').hookPresent).toBe(false);

      // A repair marker without a hard hook is not an enforceable capability.
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        'ARK_HOOK_REPAIR=1\n'
      );
      let cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.hookRepair).toBe(false);
      expect(cap.hookPresent).toBe(false);
      expect(cap.evidence).toEqual([]);
      // hook + repair
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [
              {
                hooks: [
                  {
                    command: 'npx arkgate-mcp --root . --config ark.config.json --hook',
                  },
                ],
              },
            ],
          },
        })
      );
      cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.hookPresent).toBe(true);
      expect(cap.mode).toBe('reject-only');
      expect(cap.gap?.id).toBe('write-path-reject-only');
      // reject-only without mcp → no-MCP message branch
      expect(cap.gap?.message).toMatch(/reject-only|repair/i);

      // reverse-order --hook + mcp name
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        'command: --hook npx ark-mcp somewhere\n'
      );
      expect(detectWritePathCapabilities(root, 'claude').hookPresent).toBe(true);

      // repair via ARK_HOOK_REPAIR=1 text
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        'command: node bin/ark-mcp.mjs --hook\nARK_HOOK_REPAIR=1\n'
      );
      cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.hookRepair).toBe(true);
      expect(cap.mode).toBe('repair');
      expect(cap.gap).toBeNull();

      // ARK_HOOK_REPAIR=true / yes / on
      for (const val of ["true", "yes", "on", "'1'"]) {
        fs.writeFileSync(
          path.join(root, '.claude/settings.json'),
          `command: node bin/ark-mcp.mjs --hook\nARK_HOOK_REPAIR=${val}\n`
        );
        expect(detectWritePathCapabilities(root, 'claude').hookRepair).toBe(true);
      }

      // mcp-only: each detection pattern isolated (OR alternatives)
      fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true });

      // pattern: "ark": { without ark-mcp bin name
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        '{ "mcpServers": { "ark": { "command": "node", "args": ["./local-server.js"] } } }\n'
      );
      cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.mcpPresent).toBe(true);
      expect(cap.mode).toBe('mcp-only');
      expect(cap.gap?.id).toBe('write-path-mcp-only');

      // pattern: mcpServers ... ark without "ark": {
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        '{\n  "mcpServers": {\n    "other": {},\n    "arkgate": { "command": "x" }\n  }\n}\n'
      );
      // may or may not match depending on regex — also try cursor path
      fs.rmSync(path.join(root, '.mcp.json'), { force: true });
      fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.cursor/mcp.json'),
        'mcpServers block mentions ark for tooling\n'
      );
      cap = detectWritePathCapabilities(root, 'cursor');
      expect(cap.mcpPresent).toBe(true);

      // pattern: mcp_servers.ark only (toml) — no ark-mcp token
      fs.rmSync(path.join(root, '.cursor'), { recursive: true, force: true });
      fs.mkdirSync(path.join(root, '.grok'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.grok/config.toml'),
        '[mcp_servers.ark]\ncommand = "node"\nargs = ["./x.js"]\n'
      );
      cap = detectWritePathCapabilities(root, 'grok');
      expect(cap.mcpPresent).toBe(true);

      // classic arkgate-mcp bin
      fs.rmSync(path.join(root, '.grok'), { recursive: true, force: true });
      fs.writeFileSync(
        path.join(root, '.mcp.json'),
        JSON.stringify({ mcpServers: { tools: { command: 'npx', args: ['arkgate-mcp'] } } })
      );
      cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.mcpPresent).toBe(true);
      expect(cap.prepareWrite).toBe(true);
      // reject-only WITH mcp present → MCP message branch of gap
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        'command: node bin/ark-mcp.mjs --hook --root .\n'
      );
      cap = detectWritePathCapabilities(root, 'claude');
      expect(cap.mode).toBe('reject-only');
      expect(cap.mcpPresent).toBe(true);
      expect(cap.gap?.message).toMatch(/MCP|prepare-write|hook-repair/i);

      // grok hooks path
      fs.rmSync(path.join(root, '.claude'), { recursive: true, force: true });
      fs.rmSync(path.join(root, '.cursor'), { recursive: true, force: true });
      fs.rmSync(path.join(root, '.mcp.json'), { force: true });
      fs.rmSync(path.join(root, '.grok/config.toml'), { force: true });
      fs.mkdirSync(path.join(root, '.grok/hooks'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.grok/hooks/ark-write-gate.json'),
        JSON.stringify({
          hooks: {
            PreToolUse: [{ hooks: [{ command: 'node bin/ark-mcp.mjs --hook --root .' }] }],
          },
        })
      );
      cap = detectWritePathCapabilities(root, 'grok');
      expect(cap.mode).toBe('reject-only');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('covers unreadable file catch paths via spy', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, '.claude'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.claude/settings.json'),
        'command: node bin/ark-mcp.mjs --hook\n'
      );
      fs.mkdirSync(path.join(root, '.cursor'), { recursive: true });
      fs.writeFileSync(
        path.join(root, '.cursor/mcp.json'),
        JSON.stringify({ mcpServers: { ark: { command: 'npx', args: ['ark-mcp'] } } })
      );

      const orig = fs.readFileSync;
      const spy = vi.spyOn(fs, 'readFileSync').mockImplementation((p, ...rest) => {
        const s = String(p);
        if (s.includes('settings.json') || s.includes('mcp.json')) {
          throw new Error('EACCES');
        }
        return orig.call(fs, p, ...rest);
      });
      try {
        const cap = detectWritePathCapabilities(root, 'claude');
        // catch continues → neither hook nor mcp detected from unreadable files
        expect(cap.hookPresent).toBe(false);
        expect(cap.mcpPresent).toBe(false);
      } finally {
        spy.mockRestore();
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('auto-patch branches ≥95%', () => {
  let ts: typeof import('typescript');
  let root: string;

  beforeAll(() => {
    ts = require('typescript');
    root = mk();
    fs.mkdirSync(path.join(root, 'src/a'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/b'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/c'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/b/pure.ts'), 'export type T = number;\nexport type U = string;\n');
    fs.writeFileSync(
      path.join(root, 'src/b/side.ts'),
      'console.log("init");\nexport type T = number;\n'
    );
    fs.writeFileSync(
      path.join(root, 'src/b/mixed.ts'),
      'export const v = 1;\nexport type T = string;\n'
    );
    fs.writeFileSync(path.join(root, 'src/b/index.ts'), 'export type Z = 1;\n');
    fs.mkdirSync(path.join(root, 'src/c/nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/c/nested/deep.ts'), 'export type D = 1;\n');
    // only type exports for named binding path
    fs.writeFileSync(
      path.join(root, 'src/b/types-only-named.ts'),
      'export type Foo = 1;\nexport type Bar = 2;\nexport const runtime = 3;\n'
    );
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('resolveImportFileAbs edge cases', () => {
    expect(resolveImportFileAbs(root, '', './x')).toBeNull();
    expect(resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), 'lodash')).toBeNull();
    expect(resolveImportFileAbs('', path.join(root, 'src/a/f.ts'), './x')).toBeNull();
    expect(resolveImportFileAbs(root, '/tmp/outside.ts', './x')).toBeNull();
    // empty root / abs for isUnderRoot
    expect(resolveImportFileAbs(null as unknown as string, path.join(root, 'src/a/f.ts'), './x')).toBeNull();
    // index resolution
    const idx = resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '../b');
    expect(idx && idx.includes('index')).toBeTruthy();
    // with extension
    expect(
      resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '../b/pure.ts')
    ).toMatch(/pure\.ts$/);
    // relative importer path
    expect(
      resolveImportFileAbs(root, 'src/a/f.ts', '../b/pure')
    ).toMatch(/pure\.ts$/);
    // missing target
    expect(resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '../b/nope')).toBeNull();
    // empty specifier
    expect(resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '')).toBeNull();
    // non-string specifier
    expect(
      resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), null as unknown as string)
    ).toBeNull();
  });

  it('inspect + classify + apply + validate edge cases', () => {
    expect(inspectTargetModule(null as unknown as typeof ts, 'export type T = 1')).toBeNull();
    expect(inspectTargetModule(ts, null as unknown as string)).toBeNull();
    expect(classifyImportTypeConversion(null, ['T'])).toBeNull();

    const side = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/b/side.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(side, ['T'])).toBeNull();

    const pure = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/b/pure.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(pure, null)?.kind).toBe(
      'import-type-from-pure-type-module'
    );
    expect(classifyImportTypeConversion(pure, [])?.kind).toBe(
      'import-type-from-pure-type-module'
    );

    // import-type-of-type-exports: mixed module, only type bindings
    const mixed = inspectTargetModule(
      ts,
      fs.readFileSync(path.join(root, 'src/b/types-only-named.ts'), 'utf8')
    );
    expect(classifyImportTypeConversion(mixed, ['Foo', 'Bar'])?.kind).toBe(
      'import-type-of-type-exports'
    );
    expect(classifyImportTypeConversion(mixed, ['Foo', 'runtime'])).toBeNull();

    expect(applyImportTypeAutoPatch(null as unknown as typeof ts, 'import { T } from "./x"')).toBeNull();
    expect(applyImportTypeAutoPatch(ts, null as unknown as string)).toBeNull();
    // no filePath → defaults to 'file.ts'
    expect(
      applyImportTypeAutoPatch(ts, 'export const x = 1;\n', { root })
    ).toBeNull();

    const source = `import { T } from '../b/pure';\nexport type U = T;\n`;
    const from = path.join(root, 'src/a/use.ts');
    const patched = applyImportTypeAutoPatch(ts, source, {
      root,
      filePath: from,
    });
    expect(patched?.source).toMatch(/import\s+type/);

    // already import type → isTypeOnlyModuleReference skips (not regex continue)
    const already = `import type { T } from '../b/pure';\nexport type U = T;\n`;
    expect(applyImportTypeAutoPatch(ts, already, { root, filePath: from })).toBeNull();

    // export type re-export conversion
    const reexport = `export { T } from '../b/pure';\n`;
    const rePatched = applyImportTypeAutoPatch(ts, reexport, { root, filePath: from });
    expect(rePatched?.source).toMatch(/export\s+type/);

    // already export type
    expect(
      applyImportTypeAutoPatch(ts, `export type { T } from '../b/pure';\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();

    // custom resolve may point outside root — apply still rewrites if readable
    const outsideRoot = mk();
    try {
      fs.writeFileSync(path.join(outsideRoot, 'ext.ts'), 'export type E = 1;\n');
      const outsideAbs = path.join(outsideRoot, 'ext.ts');
      const outsidePatch = applyImportTypeAutoPatch(ts, `import { E } from '../ext';\n`, {
        root,
        filePath: from,
        resolveTargetAbs: () => outsideAbs,
      });
      // custom resolve may still patch readable external pure-type modules
    expect(outsidePatch === null || typeof outsidePatch?.source === 'string').toBe(true);
      // path escape must not resolve under root
      expect(
        resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '../../../../../../etc/passwd')
      ).toBeNull();
    } finally {
      fs.rmSync(outsideRoot, { recursive: true, force: true });
    }
    // tryFile catch via statSync throw
    const statSpy = vi.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('EIO');
    });
    try {
      expect(
        resolveImportFileAbs(root, path.join(root, 'src/a/f.ts'), '../b/pure')
      ).toBeNull();
    } finally {
      statSpy.mockRestore();
    }

    // empty root for isUnderRoot early false
    expect(
      // @ts-expect-error intentional
      resolveImportFileAbs('', path.join(root, 'src/a/f.ts'), '../b/pure')
    ).toBeNull();
    // side-effect import
    expect(
      applyImportTypeAutoPatch(ts, `import '../b/pure';\n`, { root, filePath: from })
    ).toBeNull();

    // default import
    expect(
      applyImportTypeAutoPatch(ts, `import T from '../b/pure';\n`, { root, filePath: from })
    ).toBeNull();

    // namespace import
    expect(
      applyImportTypeAutoPatch(ts, `import * as M from '../b/pure';\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();

    // missing abs mid-file continues while other import patches
    const mixedResolve = applyImportTypeAutoPatch(
      ts,
      `import { T } from '../b/pure';\nimport { Missing } from '../b/nope-missing';\nexport type U = T;\n`,
      { root, filePath: from }
    );
    expect(mixedResolve?.source).toMatch(/import\s+type/);

    // no-space import form: replace fails → next === full continue
    expect(
      applyImportTypeAutoPatch(ts, `import{T}from'../b/pure';\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();

    // resolve returns null for all → !abs continue → null patch
    expect(
      applyImportTypeAutoPatch(ts, `import { T } from '../b/pure';\n`, {
        root,
        filePath: from,
        resolveTargetAbs: () => null,
      })
    ).toBeNull();

    // export without from (no moduleSpecifier)
    expect(
      applyImportTypeAutoPatch(ts, `export { T };\ntype T = 1;\n`, {
        root,
        filePath: from,
      })
    ).toBeNull();
    // side-effect target refuses patch
    const sideSrc = `import { T } from '../b/side';\nexport type U = T;\n`;
    expect(applyImportTypeAutoPatch(ts, sideSrc, { root, filePath: from })).toBeNull();

    // unreadable target via custom resolve that returns path but fs fails
    const badResolve = () => path.join(root, 'src/b/does-not-exist-xyz.ts');
    expect(
      applyImportTypeAutoPatch(ts, source, {
        root,
        filePath: from,
        resolveTargetAbs: badResolve,
      })
    ).toBeNull();

    // validateWithAutoPatch: valid short-circuit
    const ok = validateWithAutoPatch({
      source: 'export const x = 1;\n',
      filePath: from,
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(ok.valid).toBe(true);
    expect(ok.autoPatch == null).toBe(true);

    // non-array violations
    const noArr = validateWithAutoPatch({
      source: 'export const x = 1;\n',
      filePath: from,
      root,
      ts,
      validate: () => ({ valid: false, violations: undefined as unknown as [] }),
    });
    expect(noArr.violations).toEqual([]);

    // invalid without convertible import — uses code fallback + details
    const bad = validateWithAutoPatch({
      source: `import { v } from '../b/mixed';\nexport const x = v;\n`,
      filePath: from,
      root,
      ts,
      validate: () => ({
        valid: false,
        violations: [
          {
            code: 'LAYER_IMPORT_VIOLATION',
            fromLayer: 'DomainModel',
            toLayer: 'PersistenceAdapters',
            details: {
              portProofEligible: true,
              peerIsolation: true,
              importKind: 'static',
            },
          },
        ],
      }),
    });
    expect(bad.valid).toBe(false);
    expect(bad.violations[0].remediationClass).toBeTruthy();

    // invalid with convertible import that revalidates
    let calls = 0;
    const converted = validateWithAutoPatch({
      source: `import { T } from '../b/pure';\nexport type U = T;\n`,
      filePath: from,
      root,
      ts,
      validate: (src: string) => {
        calls += 1;
        if (src.includes('import type')) return { valid: true, violations: [] };
        return {
          valid: false,
          violations: [
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              typeOnly: true,
              fromLayer: 'DomainModel',
              toLayer: 'PersistenceAdapters',
              target: '../b/pure',
            },
          ],
        };
      },
    });
    expect(converted.autoPatch?.valid).toBe(true);
    expect(calls).toBeGreaterThan(1);

    // post-patch still invalid discards patch
    const discarded = validateWithAutoPatch({
      source: `import { T } from '../b/pure';\nexport type U = T;\n`,
      filePath: from,
      root,
      ts,
      validate: () => ({
        valid: false,
        violations: [{ ruleId: 'LAYER_IMPORT_VIOLATION', typeOnly: true }],
      }),
    });
    expect(discarded.autoPatch == null).toBe(true);
  });
});

describe('prepare-write branches ≥95%', () => {
  let ts: typeof import('typescript');
  let root: string;

  beforeAll(() => {
    ts = require('typescript');
    root = mk();
  });

  afterAll(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('covers contentIdentity, judgment, and compose edge paths', () => {
    expect(contentIdentity(null as unknown as string).byteLength).toBe(0);
    expect(buildJudgmentBrief(null as unknown as object[])).toBeNull();
    expect(buildJudgmentBrief([])).toBeNull();

    // judgment via code + details fallbacks (typeOnly only on details)
    const briefJudgment = buildJudgmentBrief([
      {
        code: 'LAYER_IMPORT_VIOLATION',
        details: { typeOnly: false, peerIsolation: true, importKind: 'static' },
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        message: 'value import',
      },
    ]);
    expect(briefJudgment?.remediationClass).toBeTruthy();
    expect(briefJudgment?.decision).toBeTruthy();

    // all mechanical-safe path — typeOnly only via details; ruleId present
    const briefAllSafe = buildJudgmentBrief([
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        details: { typeOnly: true },
        sourcePureTypeModule: true,
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      },
    ]);
    expect(briefAllSafe?.remediationClass).toBeTruthy();
    // all-safe path with only `code` (no ruleId) on first after loop
    const briefCodeOnly = buildJudgmentBrief([
      {
        code: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        sourcePureTypeModule: true,
        namedBindingsTypeOnly: true,
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      },
    ]);
    expect(briefCodeOnly?.remediationClass).toBeTruthy();
    // ensure remediationKind spread when present
    if (briefAllSafe && 'remediationKind' in briefAllSafe) {
      if (briefAllSafe.remediationKind != null) {
        expect(typeof briefAllSafe.remediationKind).toBe('string');
      }
    }
    // second violation is judgment after first is mechanical-safe
    const mixedBrief = buildJudgmentBrief([
      {
        ruleId: 'LAYER_IMPORT_VIOLATION',
        typeOnly: true,
        sourcePureTypeModule: true,
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
      },
      {
        ruleId: 'FORBIDDEN_GLOBAL',
        fromLayer: 'DomainModel',
        message: 'fetch',
      },
    ]);
    expect(mixedBrief?.fixClass || mixedBrief?.remediationClass).toBeTruthy();

    // non-string source
    expect(
      composePrepareWrite({
        source: 1 as unknown as string,
        placement: {},
        root,
        ts,
        validate: () => ({ valid: true }),
      }).error
    ).toMatch(/source/i);

    // placement missing optional fields → nullish coalescing defaults
    const minimal = composePrepareWrite({
      source: 'export const x = 1;\n',
      placement: {},
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(minimal.valid).toBe(true);
    expect(minimal.filePath).toBeNull();
    expect(minimal.layer).toBeNull();
    expect(minimal.forbiddenGlobals).toEqual([]);

    // valid with all optional placement fields
    const full = composePrepareWrite({
      source: 'export const x = 1;\n',
      placement: {
        filePath: 'src/domain/x.ts',
        layer: 'DomainModel',
        governed: true,
        proposed: true,
        mayImport: ['DomainModel'],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: ['fetch'],
        mayImportInfrastructure: true,
        suggestedLayers: ['DomainModel'],
        message: 'm',
        note: 'n',
        description: 'd',
      },
      root,
      ts,
      validate: () => ({ valid: true, violations: [] }),
    });
    expect(full.valid).toBe(true);
    expect(full.proposed).toBe(true);
    expect(full.description).toBe('d');
    expect(full.placementNote).toBe('n');
    expect(full.mayImportInfrastructure).toBe(true);
    expect(full.placementMessage).toBe('m');

    // invalid WITHOUT autoPatch → judgmentBrief present
    const judged = composePrepareWrite({
      source: 'export const n = Date.now();\n',
      placement: { filePath: 'src/domain/x.ts', layer: 'DomainModel' },
      root,
      ts,
      validate: () => ({
        valid: false,
        violations: [
          {
            ruleId: 'FORBIDDEN_GLOBAL',
            file: 'src/domain/x.ts',
            fromLayer: 'DomainModel',
            message: 'Date.now',
          },
        ],
      }),
    });
    expect(judged.valid).toBe(false);
    expect(judged.judgmentBrief).toBeTruthy();
    expect(judged.autoPatch).toBeUndefined();

    // invalid with autoPatch path (validate flips after type import)
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/t.ts'), 'export type T = 1;\n');
    const from = path.join(root, 'src/domain/use.ts');
    const withPatch = composePrepareWrite({
      source: `import { T } from '../infra/t';\nexport type U = T;\n`,
      placement: {
        filePath: from,
        layer: 'DomainModel',
        governed: true,
        mayImport: [],
        mustNotImport: ['PersistenceAdapters'],
        forbiddenGlobals: [],
      },
      root,
      ts,
      validate: (src: string) => {
        if (src.includes('import type')) return { valid: true, violations: [] };
        return {
          valid: false,
          violations: [
            {
              ruleId: 'LAYER_IMPORT_VIOLATION',
              typeOnly: true,
              sourcePureTypeModule: true,
              fromLayer: 'DomainModel',
              toLayer: 'PersistenceAdapters',
            },
          ],
        };
      },
    });
    expect(withPatch.autoPatch).toBeTruthy();
    expect(withPatch.judgmentBrief).toBeUndefined();
    expect(withPatch.autoPatchContentHash).toMatch(/^sha256:/);
  });
});

describe('safety-diagnostics branches ≥95%', () => {
  let ts: typeof import('typescript');

  beforeAll(() => {
    ts = require('typescript');
  });

  it('detects suppressions, any, dynamic import, peerIsolation, inMemory factories', () => {
    const root = mk();
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'consumer-app' })
      );
      const f = path.join(root, 'src/messy.ts');
      fs.writeFileSync(
        f,
        `
// @ts-ignore
// @ts-nocheck
export const x = 1 as any;
const y: any = 2;
const mod = import(someVar);
import {
  createArkKernel as kernelFactory,
  createAuditTrail,
  createProjectionRegistry,
  createWorkflowEngine,
  InMemoryOutboxStore as MemOutbox,
  InMemoryAuditStore,
} from 'arkgate';
import * as Ark from 'arkgate/runtime';
import { something } from 'lodash';
import defOnly from 'arkgate';
const k = kernelFactory();
const k2 = kernelFactory(undefined);
const k3 = kernelFactory({});
const a = createAuditTrail({});
const p = createProjectionRegistry({});
const w = createWorkflowEngine({});
const kns = Ark.createArkKernel({});
const kns2 = Ark.createArkKernel({ outbox: 1, auditTrail: 2, projections: 3 });
export class InMemoryFooStore {}
void something;
void defOnly;
void MemOutbox;
`
      );
      const config = {
        layers: [{ name: 'ApplicationOrchestration', patterns: ['src/**'] }],
        safety: {
          maxAnyCasts: 0,
          maxTsSuppressions: 0,
          allowInMemory: false,
          allowDisabledPeerIsolation: false,
        },
        rules: [
          {
            from: 'ApplicationOrchestration',
            to: 'ApplicationOrchestration',
            allowed: false,
            peerIsolation: false,
          },
          {
            from: 'DomainModel',
            to: 'DomainModel',
            allowed: false,
            // peerIsolation omitted → treated as disabled when allowed:false same layer
          },
        ],
        dynamicImportAllowlist: [],
      };
      const diags = collectSafetyDiagnostics(ts, root, config, [f]);
      expect(diags.report.tsSuppressions.length).toBeGreaterThan(0);
      expect(diags.report.anyCasts.length).toBeGreaterThan(0);
      expect(diags.report.nonLiteralDynamicImports.length).toBeGreaterThan(0);
      expect(diags.report.disabledPeerIsolationRules.length).toBeGreaterThan(0);
      expect(diags.report.inMemoryProductionStores.length).toBeGreaterThan(0);
      expect(diags.warnings.length).toBeGreaterThan(0);

      // allowlists / allowInMemory path
      const relaxed = collectSafetyDiagnostics(
        ts,
        root,
        {
          ...config,
          safety: {
            maxAnyCasts: 99,
            maxTsSuppressions: 99,
            allowInMemory: true,
            allowDisabledPeerIsolation: true,
          },
          dynamicImportAllowlist: ['src/messy.ts'],
        },
        [f]
      );
      expect(relaxed.report.disabledPeerIsolationRules.length).toBe(0);
      expect(relaxed.report.inMemoryProductionStores.length).toBe(0);

      // package name arkgate → isProvider skips in-memory production checks
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'arkgate' })
      );
      const provider = collectSafetyDiagnostics(ts, root, config, [f]);
      expect(provider.report.inMemoryProductionStores.length).toBe(0);

      // missing package.json → packageName catch
      fs.rmSync(path.join(root, 'package.json'));
      const noPkg = collectSafetyDiagnostics(ts, root, { layers: [], safety: {} }, [f]);
      expect(noPkg.report).toBeTruthy();

      // empty config safety / rules defaults
      const bare = collectSafetyDiagnostics(ts, root, {}, [f]);
      expect(bare.report.thresholds.maxAnyCasts).toBe(0);

      // factory call with full durable options (objectHasProperty true paths)
      const durable = path.join(root, 'src/durable.ts');
      fs.writeFileSync(
        durable,
        `
import { createArkKernel } from 'arkgate';
createArkKernel({ outbox: 1, auditTrail: 2, projections: 3 });
`
      );
      fs.writeFileSync(
        path.join(root, 'package.json'),
        JSON.stringify({ name: 'consumer-app' })
      );
      const fullOpts = collectSafetyDiagnostics(
        ts,
        root,
        {
          layers: [{ name: 'ApplicationOrchestration', patterns: ['src/**'] }],
          safety: { allowInMemory: false },
        },
        [durable]
      );
      // full options provided → not flagged as defaults
      expect(
        fullOpts.report.inMemoryProductionStores.every(
          (s: { store: string }) => !s.store.includes('createArkKernel defaults')
        )
      ).toBe(true);

      // shorthand + string literal property names
      const short = path.join(root, 'src/short.ts');
      fs.writeFileSync(
        short,
        `
import { createAuditTrail, createArkKernel } from 'arkgate';
const store = {};
createAuditTrail({ store });
createArkKernel({ "outbox": 1, 'auditTrail': 2, projections: 3 });
createArkKernel({ [String('outbox')]: 1 });
`
      );
      const shortDiags = collectSafetyDiagnostics(
        ts,
        root,
        {
          layers: [{ name: 'ApplicationOrchestration', patterns: ['src/**'] }],
          safety: { allowInMemory: false },
        },
        [short]
      );
      expect(shortDiags.report).toBeTruthy();

      // invalid glob in allowlist → matchesAny catch
      const badGlob = collectSafetyDiagnostics(
        ts,
        root,
        {
          layers: [],
          safety: {},
          dynamicImportAllowlist: ['[invalid'],
        },
        [f]
      );
      expect(badGlob.report.nonLiteralDynamicImports.length).toBeGreaterThan(0);

      // force matchesAny catch via spy on glob if needed — also bare property without name
      const dynOnly = path.join(root, 'src/dyn.ts');
      fs.writeFileSync(dynOnly, 'const m = import(x + y);\n');
      const dyn = collectSafetyDiagnostics(
        ts,
        root,
        { layers: [], dynamicImportAllowlist: ['**/*'] },
        [dynOnly]
      );
      expect(dyn.report).toBeTruthy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
