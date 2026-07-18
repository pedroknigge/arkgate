import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { validateSnippetAnalysis } from '../../../bin/lib/snippet-analysis.mjs';

const REPO = path.resolve('.');
const CHECK = path.join(REPO, 'bin/ark-check.mjs');
const roots: string[] = [];

const CONFIG = {
  $schema: 'https://unpkg.com/arkgate@2/schemas/ark.config.schema.json',
  schemaVersion: '1.0',
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
};

function temporaryRoot(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

function writeProject(root: string, source: string): void {
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.mkdirSync(path.join(root, 'src/infra'), { recursive: true });
  fs.mkdirSync(path.join(root, '.github/workflows'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(CONFIG, null, 2)}\n`);
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# ArkGate test fixture\n');
  fs.writeFileSync(path.join(root, '.mcp.json'), '{}\n');
  fs.writeFileSync(
    path.join(root, '.github/workflows/ark.yml'),
    'jobs:\n  architecture:\n    steps:\n      - run: ark-check --strict-merge\n'
  );
  fs.writeFileSync(path.join(root, 'src/domain/order.ts'), source);
  fs.writeFileSync(path.join(root, 'src/infra/repository.ts'), 'export const repository = 1;\n');
}

function runCheck(check: string, root: string, args: string[], json = true) {
  const result = spawnSync(
    process.execPath,
    [check, '--root', root, '--config', 'ark.config.json', ...args, ...(json ? ['--json'] : []), '--no-cache'],
    { cwd: REPO, encoding: 'utf8' }
  );
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Z02 analysis completeness', () => {
  it('fails closed when snippet parsing is partial or unavailable', () => {
    const gate = { validate: () => ({ valid: true, violations: [] }) };
    expect(
      validateSnippetAnalysis({
        gate,
        ts,
        source: 'export const broken = ;\n',
        context: { filePath: 'src/domain/broken.ts' },
      })
    ).toMatchObject({
      valid: false,
      completeness: 'partial',
      violations: [{ ruleId: 'ANALYSIS_PARSE_INCOMPLETE' }],
    });
    expect(
      validateSnippetAnalysis({
        gate,
        ts: undefined,
        source: 'export const clean = 1;\n',
        context: { filePath: 'src/domain/clean.ts' },
      })
    ).toMatchObject({
      valid: false,
      completeness: 'unavailable',
      violations: [{ ruleId: 'ANALYSIS_HOST_UNAVAILABLE' }],
    });
  });

  it('does not satisfy a plan when no API-compatible TypeScript host is available', () => {
    const sandbox = temporaryRoot('ark-z02-missing-host-');
    const toolRoot = path.join(sandbox, 'tool');
    const projectRoot = path.join(sandbox, 'project');
    fs.cpSync(path.join(REPO, 'bin'), path.join(toolRoot, 'bin'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(toolRoot, 'package.json'),
      `${JSON.stringify({ name: 'arkgate-detached-test', version: '0.0.0', type: 'module' })}\n`
    );
    writeProject(projectRoot, 'export const order = 1;\n');

    const result = runCheck(path.join(toolRoot, 'bin/ark-check.mjs'), projectRoot, ['--plan']);
    expect(result.status).toBe(2);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      plan: { completeness: 'unavailable', goal: { met: false } },
    });

    const full = runCheck(path.join(toolRoot, 'bin/ark-check.mjs'), projectRoot, []);
    expect(full.status).toBe(2);
    expect(JSON.parse(full.stdout)).toMatchObject({
      schemaVersion: '1.2',
      completeness: 'unavailable',
      valid: false,
      ok: false,
      diagnostics: [{ ruleId: 'ANALYSIS_HOST_UNAVAILABLE' }],
    });
    expect(JSON.parse(full.stdout).diagnostics[0].nextAction).toContain(
      'typescript-ark-host@6.0.3'
    );

    const doctor = runCheck(path.join(toolRoot, 'bin/ark-check.mjs'), projectRoot, ['--doctor']);
    expect(doctor.status).toBe(2);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      ok: false,
      doctor: {
        completeness: 'unavailable',
        designFitness: { status: 'analysis-incomplete' },
        baseline: { stale: null },
      },
    });
    expect(JSON.parse(doctor.stdout).doctor.operatingMode).not.toBe('enforce');

    const humanDoctor = runCheck(path.join(toolRoot, 'bin/ark-check.mjs'), projectRoot, ['--doctor'], false);
    expect(humanDoctor.status).toBe(2);
    expect(humanDoctor.stdout).toContain('Analysis unavailable');
    expect(humanDoctor.stdout).toContain('contract compliance is not verified');
    expect(humanDoctor.stdout).not.toContain('ENFORCE');
    expect(humanDoctor.stdout).not.toContain('None — the code matches the contract');
    expect(humanDoctor.stdout).not.toContain('Healthy — nothing to do');
  });

  it('marks a fully parsed clean project complete', () => {
    const root = temporaryRoot('ark-z02-complete-');
    writeProject(root, 'export const order = 1;\n');

    const result = runCheck(CHECK, root, []);
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      schemaVersion: '1.2',
      completeness: 'complete',
      valid: true,
      ok: true,
    });
  });

  it('marks a parse-incomplete plan partial instead of satisfied', () => {
    const root = temporaryRoot('ark-z02-parse-plan-');
    writeProject(root, 'export const broken = ;\n');

    const result = runCheck(CHECK, root, ['--plan']);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      plan: { completeness: 'partial', goal: { met: false } },
    });

    const doctor = runCheck(CHECK, root, ['--doctor']);
    expect(doctor.status).toBe(0);
    expect(JSON.parse(doctor.stdout)).toMatchObject({
      ok: false,
      doctor: {
        completeness: 'partial',
        designFitness: { status: 'analysis-incomplete' },
        baseline: { stale: null },
      },
    });
    expect(JSON.parse(doctor.stdout).doctor.operatingMode).not.toBe('enforce');

    const humanDoctor = runCheck(CHECK, root, ['--doctor'], false);
    expect(humanDoctor.status).toBe(0);
    expect(humanDoctor.stdout).toContain('Analysis incomplete');
    expect(humanDoctor.stdout).toContain('contract compliance is not verified');
    expect(humanDoctor.stdout).not.toContain('ENFORCE');
    expect(humanDoctor.stdout).not.toContain('None — the code matches the contract');
    expect(humanDoctor.stdout).not.toContain('Healthy — nothing to do');
  });

  it('returns a failing exit for a strict parse-incomplete plan', () => {
    const root = temporaryRoot('ark-z02-parse-plan-strict-');
    writeProject(root, 'export const broken = ;\n');

    const result = runCheck(CHECK, root, ['--plan', '--strict-merge']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      ok: false,
      plan: { completeness: 'partial', goal: { met: false } },
    });
  });

  it('fails a strict-merge verdict when governed parsing is incomplete', () => {
    const root = temporaryRoot('ark-z02-parse-strict-');
    writeProject(root, 'export const broken = ;\n');

    const result = runCheck(CHECK, root, ['--strict-merge']);
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({
      completeness: 'partial',
      ok: false,
    });
  });

  it('exposes one stable CI gate for the complete packed matrix', () => {
    const workflow = fs.readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
    expect(workflow).toContain('ts-compat-gate:');
    expect(workflow).toContain('name: TypeScript compatibility gate');
    expect(workflow).toContain('needs: ts-compat');
    expect(workflow).toContain('MATRIX_RESULT: ${{ needs.ts-compat.result }}');
    expect(workflow).toContain('run: test "$MATRIX_RESULT" = success');
  });
});
