/**
 * U06 — dual-depth remediation over the real pre-tool path (ADR 0009 A6/D5).
 *
 * A casual user gets one plain next action (define a port); a senior gets
 * stable JSON (ruleId, capability, fixClass, nextAction). The full hook path
 * (ark-mcp --hook, fresh child process) denies with that same dual-depth
 * output; the bench harness stays in record mode until the Linux baseline.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const temps: string[] = [];

function mk(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-u06-'));
  temps.push(root);
  return root;
}

afterEach(() => {
  for (const root of temps.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function project(root: string) {
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      include: ['src'],
      layers: [{ name: 'DomainModel', patterns: ['src/domain/**'], pure: true }],
      rules: [],
    })
  );
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'src/domain/repo.ts'),
    "import { Client } from 'pg';\nexport const make = () => new Client();\n"
  );
}

describe('U06 dual depth — CLI check surface', () => {
  it('JSON carries ruleId, capability, fixClass, and a port nextAction; human output stays plain', () => {
    const root = mk();
    project(root);
    let jsonOut = '';
    try {
      jsonOut = execFileSync(
        'node',
        [path.resolve('bin/ark-check.mjs'), '--root', root, '--json', '--no-cache'],
        { encoding: 'utf8', stdio: 'pipe' }
      );
    } catch (error) {
      jsonOut = (error as { stdout: string }).stdout;
    }
    const payload = JSON.parse(jsonOut);
    const wall = payload.violations.find(
      (v: { ruleId: string }) => v.ruleId === 'CAPABILITY_VIOLATION'
    );
    expect(wall).toBeDefined();
    expect(wall.capability).toBe('persistence');
    expect(wall.fixClass).toBe('inject-port');
    expect(wall.nextAction).toMatch(/port/i);
    expect(wall.enthusiastHint).toMatch(/StoragePort|port/i);

    const human = spawnSync(
      'node',
      [path.resolve('bin/ark-check.mjs'), '--root', root, '--no-cache'],
      { encoding: 'utf8' }
    );
    expect(human.status).not.toBe(0);
    expect(`${human.stdout}${human.stderr}`).toMatch(/CAPABILITY_VIOLATION/);
    expect(`${human.stdout}${human.stderr}`).toMatch(/Next action:.*port/i);
  });
});

describe('U06 dual depth — the real hook path denies with the same voice', () => {
  it('ark-mcp --hook blocks a denied-capability Write end to end', () => {
    const root = mk();
    project(root);
    const payload = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/new-repo.ts'),
        content: "import { Client } from 'pg';\nexport const c = Client;\n",
      },
    };
    const result = spawnSync(
      'node',
      [path.resolve('bin/ark-mcp.mjs'), '--hook', '--root', root, '--config', 'ark.config.json'],
      { input: JSON.stringify(payload), encoding: 'utf8' }
    );
    // Claude PreToolUse convention: exit 2 blocks the write.
    expect(result.status).toBe(2);
    expect(`${result.stdout}${result.stderr}`).toMatch(/persistence|CAPABILITY/i);
    expect(`${result.stdout}${result.stderr}`).toMatch(/port/i);
  });

  it('a clean Write in the same walled layer passes the hook', () => {
    const root = mk();
    project(root);
    const payload = {
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(root, 'src/domain/pure-logic.ts'),
        content: 'export const add = (a: number, b: number): number => a + b;\n',
      },
    };
    const result = spawnSync(
      'node',
      [path.resolve('bin/ark-mcp.mjs'), '--hook', '--root', root, '--config', 'ark.config.json'],
      { input: JSON.stringify(payload), encoding: 'utf8' }
    );
    expect(result.status).toBe(0);
  });
});

describe('U06 dual depth — ESLint parity (import dimension)', () => {
  it('the plugin ships no-denied-capabilities in the recommended config', async () => {
    const plugin = (await import('../../../src/eslint/index')).default;
    expect(plugin.rules['no-denied-capabilities']).toBeDefined();
    expect(
      (plugin.configs?.recommended as { rules: Record<string, string> }).rules[
        'ark/no-denied-capabilities'
      ]
    ).toBe('error');
  });

  it('reports denied imports but never runtime-erased type-only lists (/review F1)', async () => {
    const plugin = (await import('../../../src/eslint/index')).default;
    const rule = plugin.rules['no-denied-capabilities'];
    const root = mk();
    project(root); // DomainModel pure: true over src/domain/**
    const reports: unknown[] = [];
    const context = {
      getFilename: () => path.join(root, 'src/domain/repo.ts'),
      report: (descriptor: unknown) => reports.push(descriptor),
      options: [],
    };
    const listener = rule.create(context as never) as Record<
      string,
      (node: unknown) => void
    >;
    const importNode = (extra: object) => ({
      type: 'ImportDeclaration',
      source: { type: 'Literal', value: 'pg' },
      ...extra,
    });
    // Value import of a denied driver → reported.
    listener.ImportDeclaration?.(
      importNode({ importKind: 'value', specifiers: [{ type: 'ImportDefaultSpecifier' }] })
    );
    expect(reports).toHaveLength(1);
    // Statement-level `import type` → erased.
    listener.ImportDeclaration?.(
      importNode({ importKind: 'type', specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }] })
    );
    // All-type named list (`import { type Pool } from 'pg'`) — parity with the
    // symbol path: erased at runtime, must NOT report.
    listener.ImportDeclaration?.(
      importNode({ importKind: 'value', specifiers: [{ type: 'ImportSpecifier', importKind: 'type' }] })
    );
    expect(reports).toHaveLength(1);
    // Mixed list keeps its value import → reported.
    listener.ImportDeclaration?.(
      importNode({
        importKind: 'value',
        specifiers: [
          { type: 'ImportSpecifier', importKind: 'type' },
          { type: 'ImportSpecifier', importKind: 'value' },
        ],
      })
    );
    expect(reports).toHaveLength(2);
    // Innocent similar-name module → silent.
    listener.ImportDeclaration?.({
      type: 'ImportDeclaration',
      source: { type: 'Literal', value: 'pgn-parser' },
      importKind: 'value',
      specifiers: [{ type: 'ImportDefaultSpecifier' }],
    });
    expect(reports).toHaveLength(2);
  });
});

describe('U06 budgets — D5 method and Phase Z observations are locked', () => {
  it('the budgets file records the method and stays in recording mode until a Linux baseline', () => {
    const budgets = JSON.parse(
      fs.readFileSync(path.resolve('eval/performance/hook-budgets.v1.json'), 'utf8')
    );
    expect(budgets.method).toMatch(/Linux CI baseline FIRST/);
    expect(budgets.scenarios.hook).toMatchObject({
      baselineMs: 683.761,
      cycleObservedMaxP95Ms: 595.053,
      maxP95Ms: 900,
    });
    expect(budgets.scenarios.doctorCold).toMatchObject({
      baselineMs: 5154.522,
      cycleObservedMaxP95Ms: 5072.093,
      maxP95Ms: 6800,
    });
    for (const [name, spec] of Object.entries(
      budgets.scenarios as Record<
        string,
        {
          baselineMs: number | null;
          cycleObservedMaxP95Ms?: number;
          maxP95Ms: number | null;
        }
      >
    )) {
      // Either both recorded (ceiling from baseline) or both pending — never an
      // invented ceiling without its measured baseline.
      const consistent =
        (spec.baselineMs === null && spec.maxP95Ms === null) ||
        (typeof spec.baselineMs === 'number' &&
          typeof spec.maxP95Ms === 'number' &&
          spec.maxP95Ms > spec.baselineMs);
      expect(consistent, name).toBe(true);
      if (spec.cycleObservedMaxP95Ms !== undefined && spec.maxP95Ms !== null) {
        expect(spec.maxP95Ms, name).toBeGreaterThanOrEqual(
          Math.ceil(spec.cycleObservedMaxP95Ms * 1.3)
        );
      }
    }
  });
});
