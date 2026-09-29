/**
 * Real ESLint + @typescript-eslint/parser run of the Ark plugin (no hand-written harness).
 *
 * eslint is not a dependency of this repository, so the suite resolves `eslint` and
 * `@typescript-eslint/parser` from `ARK_ESLINT_DEPS` (a directory with those packages in
 * its node_modules) or from the repository itself, and skips when neither has them.
 * CI (adapter-parity job) installs them into a scratch directory, sets ARK_ESLINT_DEPS, and
 * sets ARK_REQUIRE_REAL_ESLINT=1 so a missing install fails instead of skipping.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import plugin from '../../../src/eslint/index';

type LintMessage = { ruleId: string | null; severity: number; message: string; line: number; column: number };
type EslintCtor = new (options: Record<string, unknown>) => {
  lintFiles(patterns: string[]): Promise<Array<{ filePath: string; messages: LintMessage[] }>>;
};

function loadDeps(): { ESLint: EslintCtor; parser: unknown } | null {
  const bases = [process.env.ARK_ESLINT_DEPS, process.cwd()].filter(
    (base): base is string => typeof base === 'string' && base.length > 0
  );
  for (const base of bases) {
    try {
      const req = createRequire(path.join(path.resolve(base), 'package.json'));
      const { ESLint } = req('eslint') as { ESLint: EslintCtor };
      const parser = req('@typescript-eslint/parser');
      return { ESLint, parser };
    } catch {
      /* try next base */
    }
  }
  return null;
}

const deps = loadDeps();

if (!deps && process.env.ARK_REQUIRE_REAL_ESLINT === '1') {
  throw new Error('ARK_REQUIRE_REAL_ESLINT=1 but eslint / @typescript-eslint/parser did not resolve');
}
const temps: string[] = [];

afterEach(() => {
  for (const dir of temps.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function project(config: unknown, files: Record<string, string>): string {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-real-eslint-')));
  temps.push(root);
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(config, null, 2));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

async function lint(root: string, rulesConfig: Record<string, unknown>, file: string) {
  const eslint = new deps!.ESLint({
    cwd: root,
    overrideConfigFile: true,
    overrideConfig: [
      { files: ['**/*.ts'], languageOptions: { parser: deps!.parser } },
      rulesConfig,
    ],
  });
  const [result] = await eslint.lintFiles([file]);
  return result!.messages;
}

const layerConfig = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
  ],
  rules: [
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false, message: 'Domain stays pure.' },
  ],
};
const layerFiles = {
  'src/infra/db.ts': 'export const db = {};\nexport type DbRow = { id: string };\n',
  'src/domain/a.ts':
    "import type { DbRow } from '../infra/db';\nimport { db } from '../infra/db';\nexport type A = DbRow;\nexport const b = db;\n",
};

describe.skipIf(!deps)('real ESLint run (eslint + @typescript-eslint/parser)', () => {
  it('recommended: value edge errors on the blocking rule, type-only debt warns once', async () => {
    const root = project(layerConfig, layerFiles);
    const messages = await lint(root, plugin.configs!.recommended as Record<string, unknown>, 'src/domain/a.ts');
    expect(messages.map((m) => [m.ruleId, m.severity, m.line, m.column])).toEqual([
      ['ark/architecture-advisory', 1, 1, 1],
      ['ark/no-domain-infra-imports', 2, 2, 1],
    ]);
    expect(messages[0]!.message).toContain('type placement debt');
    expect(messages[0]!.message).toContain('[LAYER_IMPORT_VIOLATION; advisory — does not fail ark-check]');
    expect(messages[1]!.message).toBe(
      "Architecture: Domain stays pure. Specifier: ../infra/db"
    );
  });

  it('single-rule config: advisory findings fall back to the blocking rule, tagged', async () => {
    const root = project(layerConfig, layerFiles);
    const messages = await lint(
      root,
      { plugins: { ark: plugin }, rules: { 'ark/no-domain-infra-imports': 'error' } },
      'src/domain/a.ts'
    );
    expect(messages.map((m) => [m.ruleId, m.line])).toEqual([
      ['ark/no-domain-infra-imports', 1],
      ['ark/no-domain-infra-imports', 2],
    ]);
    expect(messages[0]!.message).toContain('advisory — does not fail ark-check. Enable ark/architecture-advisory');
  });

  it('ArkOrder: ark-check text and a 1-based column', async () => {
    const root = project(
      {
        schemaVersion: '1.3',
        include: ['src'],
        layers: [
          { name: 'DomainModel', patterns: ['src/domain/**'] },
          { name: 'App', patterns: ['src/application/**', 'src/main.ts'] },
        ],
        rules: [{ from: 'App', to: 'DomainModel', allowed: true }],
        arkOrder: { mode: 'enforced', planeRoots: ['src/main.ts'], managedLayers: ['App'] },
      },
      {
        'src/main.ts': "import { createOrderPlane } from 'arkgate/order';\nexport const plane = createOrderPlane({});\n",
        'src/application/billing.ts':
          "export function upgrade(plane: { update(v: unknown): void }) {\n    plane.update({ plan: 'pro' });\n}\n",
      }
    );
    const messages = await lint(
      root,
      plugin.configs!.recommended as Record<string, unknown>,
      'src/application/billing.ts'
    );
    const update = messages.find((m) => m.ruleId === 'ark/no-arkorder-generic-update');
    expect(update).toMatchObject({ severity: 2, line: 2, column: 5 });
    expect(update!.message).not.toContain('{{');
    expect(update!.message).toContain('Generic update()');
  });
});
