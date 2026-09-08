/**
 * Issue #237 — write hook and ark-check must agree when an explicit file
 * pattern and a broader glob both match. Hook classifyProbe reuses
 * layerForRelativePath (same scorer as ark-check).
 */
import { describe, expect, it, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { createImportTargetResolver } from '../../../bin/lib/import-resolve.mjs';
import { layerForRelativePath } from '../../../src/domain/layerMatch';
import { catalogWhyForRuleId } from '../../../src/domain/diagnosticCatalog';

const MCP = path.resolve('bin/ark-mcp.mjs');
const CHECK = path.resolve('bin/ark-check.mjs');
const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-hr01-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

/** Amarilla-shaped overlap: explicit Domain file + Application `src/lib/**`. */
function overlappingLayers(applicationFirst: boolean) {
  const domain = {
    name: 'DomainModel',
    patterns: [
      'src/lib/finance/money.ts',
      'src/lib/features/projects/budget/budget-change-nature.ts',
      'src/lib/features/*/domain/**',
    ],
  };
  const application = {
    name: 'ApplicationOrchestration',
    patterns: ['src/lib/**'],
  };
  const persistence = {
    name: 'PersistenceAdapters',
    patterns: ['src/lib/repositories/**'],
  };
  return applicationFirst
    ? [application, domain, persistence]
    : [domain, persistence, application];
}

function writeAmarillaFixture(applicationFirst = true): string {
  const root = mk();
  fs.mkdirSync(path.join(root, 'src/lib/finance'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/lib/repositories'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/lib/features/projects/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/lib/features/projects/budget'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/lib/finance/money.ts'),
    'export function parseStoredMoneyToCents(v: string): bigint { return BigInt(v); }\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/lib/features/projects/budget/budget-change-nature.ts'),
    'export const nature = "increase";\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/lib/app-service.ts'),
    'export function orchestrate(): string { return "app"; }\n'
  );
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['./src/*'] } } })
  );
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: overlappingLayers(applicationFirst),
      rules: [
        { from: 'PersistenceAdapters', to: 'ApplicationOrchestration', allowed: false },
        { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
      ],
    })
  );
  return root;
}

function runHookWrite(root: string, relativePath: string, content: string) {
  return spawnSync(process.execPath, [MCP, '--hook', '--root', root, '--config', 'ark.config.json'], {
    encoding: 'utf8',
    input: JSON.stringify({
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, relativePath),
        content,
      },
    }),
  });
}

function runArkCheck(root: string) {
  let output = '';
  try {
    output = execFileSync(
      process.execPath,
      [CHECK, '--root', root, '--config', 'ark.config.json', '--strict-config', '--json'],
      { encoding: 'utf8', stdio: 'pipe' }
    );
  } catch (error) {
    output = (error as { stdout?: string }).stdout ?? '';
  }
  return JSON.parse(output) as {
    ok: boolean;
    violations: Array<{ ruleId: string; file?: string; toLayer?: string }>;
  };
}

describe('hook + ark-check layer specificity (#237)', () => {
  it('explicit file pattern beats a broader glob regardless of layer order', () => {
    const layersFirst = overlappingLayers(true);
    const layersLast = overlappingLayers(false);
    expect(layerForRelativePath('src/lib/finance/money.ts', layersFirst)).toBe('DomainModel');
    expect(layerForRelativePath('src/lib/finance/money.ts', layersLast)).toBe('DomainModel');
    expect(layerForRelativePath('src/lib/app-service.ts', layersFirst)).toBe(
      'ApplicationOrchestration'
    );
    expect(layerForRelativePath('src/lib/repositories/x.ts', layersFirst)).toBe(
      'PersistenceAdapters'
    );
  });

  it('resolver classifies @/lib/finance/money as DomainModel, not Application', () => {
    const root = writeAmarillaFixture(true);
    const resolve = createImportTargetResolver(ts, root, {
      layers: overlappingLayers(true),
    })!;
    const from = path.join(root, 'src/lib/repositories/probe.ts');
    const hit = resolve('@/lib/finance/money', from);
    expect(hit?.relPath).toBe('src/lib/finance/money.ts');
    expect(hit?.layer).toBe('DomainModel');
    expect(hit?.onDisk).toBe(true);

    const app = resolve('@/lib/app-service', from);
    expect(app?.layer).toBe('ApplicationOrchestration');
  });

  it('hook allows Persistence → money.ts when ark-check allows it', () => {
    const root = writeAmarillaFixture(true);
    const source = [
      'import { parseStoredMoneyToCents } from "@/lib/finance/money"',
      'export function probe(v: string): bigint {',
      '  return parseStoredMoneyToCents(v)',
      '}',
      '',
    ].join('\n');
    fs.writeFileSync(path.join(root, 'src/lib/repositories/_ark_probe.ts'), source);

    const hook = runHookWrite(root, 'src/lib/repositories/_ark_probe.ts', source);
    expect(hook.status, hook.stderr).toBe(0);
    expect(hook.stderr).not.toMatch(/LAYER_IMPORT_VIOLATION/);
    expect(hook.stderr).not.toMatch(/ApplicationOrchestration/);

    const check = runArkCheck(root);
    const layerViolations = check.violations.filter((v) => v.ruleId === 'LAYER_IMPORT_VIOLATION');
    expect(layerViolations).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('hook still denies Persistence → a real Application file', () => {
    const root = writeAmarillaFixture(true);
    const source =
      'import { orchestrate } from "@/lib/app-service"\nexport const x = orchestrate()\n';
    const hook = runHookWrite(root, 'src/lib/repositories/bad.ts', source);
    expect(hook.status).toBe(2);
    expect(hook.stderr).toMatch(/LAYER_IMPORT_VIOLATION/);
    expect(hook.stderr).toMatch(/ApplicationOrchestration/);
    expect(hook.stderr).toMatch(/provisional|ark-check/i);
    expect(hook.stderr).not.toMatch(/write hook is already the verdict/i);
  });

  it('Domain file importing an explicit Domain file is not Application', () => {
    const root = writeAmarillaFixture(false);
    const source =
      'import { nature } from "@/lib/features/projects/budget/budget-change-nature"\nexport const n = nature\n';
    const hook = runHookWrite(
      root,
      'src/lib/features/projects/domain/budget-change-buckets.ts',
      source
    );
    expect(hook.status, hook.stderr).toBe(0);
    expect(hook.stderr).not.toMatch(/LAYER_IMPORT_VIOLATION/);
  });

  it('LEXICAL catalog copy does not claim the hook is the verdict', () => {
    const why = catalogWhyForRuleId('LEXICAL_EVIDENCE_INCOMPLETE') ?? '';
    expect(why).toMatch(/provisional/i);
    expect(why).not.toMatch(/already the verdict/);
  });
});
