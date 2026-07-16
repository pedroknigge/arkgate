/**
 * U04 — opted-in capability walls over complete patches (ADR 0009 D2/D6/D7).
 *
 * Layers may deny effect capabilities (`capabilities.deny`) or declare
 * `pure: true` (deny all seven). Absence changes NO verdict. Policy-delta
 * classifies on the lowered semantic space. One violation, one voice:
 * ambient uses already covered by the layer's forbiddenGlobals report only
 * FORBIDDEN_GLOBAL.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPABILITY_IDS, effectiveCapabilityDeny } from '../../../src/domain/capabilities';
import {
  analyzePolicyDelta,
  analyzeProject,
  loadContract,
  preflightChange,
} from '../../../src/kernel/analysis';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CORPUS = path.join(REPO, 'tests/fixtures/capability-corpus');

function readCorpus(rel: string) {
  return fs.readFileSync(path.join(CORPUS, rel), 'utf8');
}

const WALLED_CONFIG = {
  include: ['src'],
  layers: [
    {
      name: 'DomainModel',
      patterns: ['src/domain/**'],
      capabilities: { deny: ['persistence', 'network'] },
    },
    { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
  ],
  rules: [],
};

describe('U04 config surface (ADR 0009 D2)', () => {
  it('accepts capabilities.deny and pure: true; absence stays valid', () => {
    expect(() => loadContract(WALLED_CONFIG)).not.toThrow();
    expect(() =>
      loadContract({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], pure: true }],
        rules: [],
      })
    ).not.toThrow();
    expect(() =>
      loadContract({ include: ['src'], layers: [{ name: 'L', patterns: ['src/**'] }], rules: [] })
    ).not.toThrow();
  });

  it('rejects unknown capability ids and malformed shapes with path-specific diagnostics', () => {
    expect(() =>
      loadContract({
        include: ['src'],
        layers: [
          { name: 'L', patterns: ['src/**'], capabilities: { deny: ['bluetooth'] } },
        ],
        rules: [],
      })
    ).toThrow(/capabilities\.deny/);
    expect(() =>
      loadContract({
        include: ['src'],
        layers: [{ name: 'L', patterns: ['src/**'], capabilities: { deny: 'persistence' } }],
        rules: [],
      })
    ).toThrow(/must be an array/);
    expect(() =>
      loadContract({
        include: ['src'],
        layers: [{ name: 'L', patterns: ['src/**'], capabilities: { allow: [] } }],
        rules: [],
      })
    ).toThrow(/unknown field/);
  });

  it('the corpus adapter-policy artifact is now loadable (activated by U04)', () => {
    const policy = JSON.parse(readCorpus('adapter-policy.config.json'));
    expect(() => loadContract(policy)).not.toThrow();
  });

  it('effectiveCapabilityDeny: pure denies all seven; deny lists dedupe and sort', () => {
    expect(effectiveCapabilityDeny({ pure: true })).toEqual([...CAPABILITY_IDS].sort());
    expect(
      effectiveCapabilityDeny({ capabilities: { deny: ['network', 'clock', 'network'] } })
    ).toEqual(['clock', 'network']);
    expect(effectiveCapabilityDeny({})).toEqual([]);
    expect(
      effectiveCapabilityDeny({ pure: true, capabilities: { deny: ['clock'] } })
    ).toEqual([...CAPABILITY_IDS].sort());
  });
});

describe('U04 walls in the pure engine (import-based evidence)', () => {
  const contract = loadContract({
    include: ['src'],
    layers: [
      { name: 'DomainModel', patterns: ['src/domain/**'], capabilities: { deny: ['persistence'] } },
      { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
    ],
    rules: [],
  });
  const pgImport = "import { Client } from 'pg';\nexport const make = () => new Client();\n";

  it('denied capability in a walled layer violates; the adapter layer stays green (D7 corpus case)', () => {
    const { ir } = analyzeProject({
      contract,
      files: [
        { path: 'src/domain/repo.ts', content: pgImport },
        { path: 'src/adapters/pg.ts', content: pgImport },
      ],
    });
    const walls = ir.violations.filter((v) => v.ruleId === 'CAPABILITY_VIOLATION');
    expect(walls).toHaveLength(1);
    expect(walls[0].evidence.file).toBe('src/domain/repo.ts');
    expect(walls[0].message).toMatch(/persistence/);
  });

  it('absence of the surface changes no verdict (brownfield safety)', () => {
    const plain = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
      rules: [],
    });
    const { ir } = analyzeProject({
      contract: plain,
      files: [{ path: 'src/domain/repo.ts', content: pgImport }],
    });
    expect(ir.violations).toEqual([]);
  });

  it('atomic preflight cannot miss a denied capability introduced across several files', () => {
    const result = preflightChange({
      contract,
      files: [{ path: 'src/domain/pure.ts', content: 'export const x = 1;\n' }],
      changes: [
        { path: 'src/domain/a.ts', content: pgImport },
        { path: 'src/domain/b.ts', content: "import axios from 'axios';\nexport const g = axios;\n" },
      ],
    });
    expect(result.valid).toBe(false);
    const walls = result.violations.filter((v) => v.ruleId === 'CAPABILITY_VIOLATION');
    expect(walls.map((v) => v.file).sort()).toEqual(['src/domain/a.ts']);
    // axios is network — not denied by this layer, so exactly one wall violation.
    expect(walls[0].nextAction).toMatch(/port/i);
  });

  it('a pure layer blocks every capability import in preflight', () => {
    const pure = loadContract({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], pure: true }],
      rules: [],
    });
    const result = preflightChange({
      contract: pure,
      files: [],
      changes: [
        { path: 'src/domain/net.ts', content: "import axios from 'axios';\nexport const g = axios;\n" },
        { path: 'src/domain/fs.ts', content: "import { readFileSync } from 'node:fs';\nexport const r = readFileSync;\n" },
      ],
    });
    expect(result.valid).toBe(false);
    const walls = result.violations.filter((v) => v.ruleId === 'CAPABILITY_VIOLATION');
    expect(walls.map((v) => v.file).sort()).toEqual(['src/domain/fs.ts', 'src/domain/net.ts']);
  });
});

describe('U04 policy delta on the lowered space (ADR 0009 D6)', () => {
  const base = JSON.parse(readCorpus('policy-delta/base.config.json'));
  const neutral = JSON.parse(readCorpus('policy-delta/candidate-neutral.config.json'));
  const weakening = JSON.parse(readCorpus('policy-delta/candidate-weakening.config.json'));

  it('the corpus neutral migration classifies neutral (fg → equivalent capabilities)', () => {
    const delta = analyzePolicyDelta({ baseConfig: base, candidateConfig: neutral });
    expect(delta.classification).toBe('neutral');
    expect(delta.blockingFindingIds).toEqual([]);
    expect(delta.valid).toBe(true);
  });

  it('the corpus weakening migration requires the hash-bound acknowledgment', () => {
    const delta = analyzePolicyDelta({ baseConfig: base, candidateConfig: weakening });
    expect(delta.classification).toBe('weakening');
    expect(delta.requiresAcknowledgement).toBe(true);
    expect(delta.valid).toBe(false);
  });

  it('bare process → deny [process] alone loses environment coverage (coverage-faithful)', () => {
    const before = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'], forbiddenGlobals: ['process'] }],
      rules: [],
    };
    const after = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'], capabilities: { deny: ['process'] } }],
      rules: [],
    };
    const delta = analyzePolicyDelta({ baseConfig: before, candidateConfig: after });
    expect(delta.classification).toBe('weakening');
  });

  it('adding a wall is strengthening; removing pure is weakening; unknown globals stay raw', () => {
    const plain = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'] }],
      rules: [],
    };
    const walled = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'], capabilities: { deny: ['clock'] } }],
      rules: [],
    };
    expect(analyzePolicyDelta({ baseConfig: plain, candidateConfig: walled }).classification).toBe(
      'strengthening'
    );
    const pure = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'], pure: true }],
      rules: [],
    };
    expect(analyzePolicyDelta({ baseConfig: pure, candidateConfig: plain }).classification).toBe(
      'weakening'
    );
    const customBefore = {
      include: ['src'],
      layers: [{ name: 'L', patterns: ['src/**'], forbiddenGlobals: ['myAppGlobal'] }],
      rules: [],
    };
    expect(
      analyzePolicyDelta({ baseConfig: customBefore, candidateConfig: plain }).classification
    ).toBe('weakening');
  });
});

describe('U04 CLI walls with D7 dedup (one violation, one voice)', () => {
  function tmpProject(config: object, files: Record<string, string>) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-u04-'));
    fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config, null, 2));
    for (const [rel, body] of Object.entries(files)) {
      const abs = path.join(root, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
    }
    return root;
  }

  function runArkCheck(root: string) {
    let output = '';
    try {
      output = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--json', '--no-cache'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    return JSON.parse(output) as {
      ok: boolean;
      violations: Array<{ ruleId: string; target?: string; file?: string }>;
    };
  }

  it('ambient + import walls violate through the symbol-aware CLI path', () => {
    const root = tmpProject(
      {
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'], capabilities: { deny: ['clock', 'persistence'] } },
        ],
        rules: [],
      },
      {
        'src/domain/rules.ts':
          "import { Client } from 'pg';\nexport function stamp(): number {\n  return Date.now();\n}\nexport const c = Client;\n",
      }
    );
    const result = runArkCheck(root);
    expect(result.ok).toBe(false);
    const walls = result.violations.filter((v) => v.ruleId === 'CAPABILITY_VIOLATION');
    expect(walls.map((v) => v.target).sort()).toEqual(['Date.now', 'pg']);
  });

  it('an ambient use covered by forbiddenGlobals reports only FORBIDDEN_GLOBAL (D7 dedup)', () => {
    const root = tmpProject(
      {
        include: ['src'],
        layers: [
          {
            name: 'DomainModel',
            patterns: ['src/domain/**'],
            forbiddenGlobals: ['Date.now'],
            capabilities: { deny: ['clock'] },
          },
        ],
        rules: [],
      },
      { 'src/domain/rules.ts': 'export function stamp(): number {\n  return Date.now();\n}\n' }
    );
    const result = runArkCheck(root);
    const forDateNow = result.violations.filter((v) => v.target === 'Date.now');
    expect(forDateNow).toHaveLength(1);
    expect(forDateNow[0].ruleId).toBe('FORBIDDEN_GLOBAL');
  });

  it('a layer without walls gains no surprise blockers (brownfield safety)', () => {
    const root = tmpProject(
      {
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      },
      {
        'src/domain/rules.ts':
          "import { Client } from 'pg';\nexport const c = Client;\nexport const t = () => Date.now();\n",
      }
    );
    const result = runArkCheck(root);
    expect(result.violations.filter((v) => v.ruleId === 'CAPABILITY_VIOLATION')).toEqual([]);
  });
});
