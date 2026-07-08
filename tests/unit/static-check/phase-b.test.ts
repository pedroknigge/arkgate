import { describe, expect, it } from 'vitest';
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  enrichViolationWithFixClass,
  INIT_WIZARD_CHOICES,
  mapWizardChoiceToArchetype,
  resolveArchetypePreset,
  shouldShowNewHereNudge,
} from '../../../bin/ark-shared.mjs';

const ARK = path.resolve('bin/ark.mjs');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');

const TWO_LAYER_CONFIG = JSON.stringify({
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'], intentPrefixes: ['Domain.'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'], intentPrefixes: ['Adapter.Persistence.'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
});

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runArkInit(root: string, extraArgs: string[] = []) {
  try {
    const stdout = execFileSync('node', [ARK, 'init', '--root', root, ...extraArgs], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function runArkCheckRaw(root: string, extraArgs: string[] = []) {
  try {
    return execFileSync('node', [ARK_CHECK, '--root', root, ...extraArgs], {
      encoding: 'utf8',
      stdio: 'pipe',
    });
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return e.stdout ?? '';
  }
}

function runArkCheckJson(root: string, extraArgs: string[] = []) {
  const stdout = runArkCheckRaw(root, ['--json', ...extraArgs]);
  return JSON.parse(stdout || '{}');
}

describe('Phase B — ark init --archetype', () => {
  it('maps crud-product to hexagonal preset and passes strict check on greenfield', () => {
    const root = mkTemp('ark-phaseb-init-');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = true;\n');

    const result = runArkInit(root, ['--archetype', 'crud-product', '--yes']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('crud-product');
    expect(result.stdout).toContain('hexagonal');
    expect(fs.existsSync(path.join(root, 'ark.config.json'))).toBe(true);

    const check = runArkCheckJson(root, ['--config', 'ark.config.json', '--strict-config']);
    expect(check.ok).toBe(true);
  });

  it('exposes wizard choices and maps keys to archetype ids', () => {
    expect(INIT_WIZARD_CHOICES).toHaveLength(8);
    expect(mapWizardChoiceToArchetype('1')).toBe('crud-product');
    expect(mapWizardChoiceToArchetype('8')).toBe('auto');
    expect(resolveArchetypePreset('api-backend').preset).toBe('hexagonal');
  });
});

describe('Phase B — doctor New here?', () => {
  it('shows New here? when config is missing', () => {
    const root = mkTemp('ark-phaseb-doctor-');
    fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/app/page.ts'), 'export const page = 1;\n');

    const out = runArkCheckRaw(root, ['--doctor']);
    expect(out).toContain('New here?');
    expect(out).toContain('--recommend');

    const json = runArkCheckJson(root, ['--doctor']);
    expect(json.doctor.newHere.show).toBe(true);
  });

  it('shouldShowNewHereNudge is true for missing config', () => {
    const root = mkTemp('ark-phaseb-nudge-');
    const configPath = path.join(root, 'ark.config.json');
    expect(shouldShowNewHereNudge(root, configPath, 100, true)).toBe(true);
    expect(shouldShowNewHereNudge(root, configPath, 30, false)).toBe(true);
    expect(shouldShowNewHereNudge(root, configPath, 90, false)).toBe(false);
  });
});

describe('Phase B — violation fix-class JSON', () => {
  it('enriches LAYER_IMPORT_VIOLATION with fixClass, effort, enthusiastHint', () => {
    const root = mkTemp('ark-phaseb-fixclass-');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(
      path.join(root, 'src/domain/order.ts'),
      "import { db } from '../infra/db';\nexport const o = db;\n"
    );
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const result = runArkCheckJson(root, ['--config', 'ark.config.json']);
    const violation = result.violations.find(
      (v: { ruleId: string }) => v.ruleId === 'LAYER_IMPORT_VIOLATION'
    );
    expect(violation).toBeDefined();
    expect(violation.fixClass).toBe('port-inversion');
    expect(violation.effort).toBe('medium');
    expect(violation.enthusiastHint).toContain('must not import');

    const direct = enrichViolationWithFixClass({
      ruleId: 'LAYER_IMPORT_VIOLATION',
      typeOnly: true,
      fromLayer: 'DomainModel',
      toLayer: 'PersistenceAdapters',
    });
    expect(direct.fixClass).toBe('file-move');
    expect(direct.effort).toBe('small');
  });
});

describe('Phase B — beginner HTML report', () => {
  it('writes simplified onboarding HTML with layer diagram and hints', () => {
    const root = mkTemp('ark-phaseb-beginner-');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const reportPath = path.join(root, 'beginner-report.html');
    runArkCheckRaw(root, ['--config', 'ark.config.json', '--report', reportPath, '--beginner']);

    expect(fs.existsSync(reportPath)).toBe(true);
    const html = fs.readFileSync(reportPath, 'utf8');
    expect(html).toContain('Beginner architecture guide');
    expect(html).toContain('How layers flow');
    expect(html).toContain('Where code goes');
    expect(html).toContain('DomainModel');
    expect(html).toContain('ark-check --report --beginner');
  });
});

describe('HTML showcase report', () => {
  it('writes a full visual report with score, coverage, and map sections', () => {
    const root = mkTemp('ark-report-showcase-');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"showcase-app"}\n');
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const reportPath = path.join(root, 'ark-report.html');
    runArkCheckRaw(root, ['--config', 'ark.config.json', '--report', reportPath]);

    const html = fs.readFileSync(reportPath, 'utf8');
    expect(html).toContain('Ark architecture report');
    expect(html).toContain('showcase-app');
    expect(html).toContain('Ark score');
    expect(html).toContain('Architecture map');
    expect(html).toContain('Files per layer');
    expect(html).toContain('Governed');
    expect(html).toContain('/ark-explain');
    expect(html).toContain('DomainModel');
  });
});

async function waitForOutput(
  chunks: string[],
  pattern: string | RegExp,
  timeoutMs = 8000
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const text = chunks.join('');
    const matched =
      typeof pattern === 'string' ? text.includes(pattern) : pattern.test(text);
    if (matched) return text;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Timed out waiting for output: ${pattern}`);
}

describe('Phase B — watch mode', () => {
  it('starts watching and re-runs check when a governed file changes', async () => {
    const root = mkTemp('ark-phaseb-watch-');
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
    fs.writeFileSync(path.join(root, 'src/infra/db.ts'), 'export const db = 1;\n');
    fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(root, 'ark.config.json'), TWO_LAYER_CONFIG);

    const child = spawn(
      'node',
      [ARK_CHECK, '--root', root, '--config', 'ark.config.json', '--watch'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    const chunks: string[] = [];
    child.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    child.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    const beforeTouch = await waitForOutput(chunks, 'Watching governed paths');

    const target = path.join(root, 'src/domain/order.ts');
    fs.writeFileSync(target, "import { db } from '../infra/db';\nexport const a = db;\n");

    const afterTouch = await waitForOutput(chunks, /violation|LAYER_IMPORT|✖/i, 10_000);
    child.kill('SIGTERM');

    expect(afterTouch.length).toBeGreaterThan(beforeTouch.length);
  }, 20_000);
});