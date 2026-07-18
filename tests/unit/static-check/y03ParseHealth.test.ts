/** Y03/Z02 — parse diagnostics stay visible and incomplete analysis fails closed. */
import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import {
  runArchitectureScan,
  scanSourceFile,
} from '../../../bin/lib/architecture-scan.mjs';
import { summarizeParseHealth } from '../../../bin/lib/parse-health.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');
const roots: string[] = [];

const CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/infra/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
};

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-y03-parse-health-'));
  roots.push(root);
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify(CONFIG));
  return root;
}

function write(root: string, rel: string, source: string): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, source);
  return file;
}

function countingTypeScript(parserIdentity = ts.version) {
  let calls = 0;
  const counted = new Proxy(ts, {
    get(target, property) {
      if (property === 'version') return parserIdentity;
      if (property !== 'createSourceFile') return Reflect.get(target, property);
      return (
        fileName: string,
        sourceText: string,
        languageVersion: ts.ScriptTarget,
        setParentNodes?: boolean,
        scriptKind?: ts.ScriptKind
      ) => {
        calls += 1;
        return target.createSourceFile(
          fileName,
          sourceText,
          languageVersion,
          setParentNodes,
          scriptKind
        );
      };
    },
  }) as typeof ts;
  return { ts: counted, calls: () => calls };
}

function runCli(root: string, args: string[]) {
  const result = spawnSync(process.execPath, [ARK_CHECK, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ARK_NO_OPEN_REPORT: '1' },
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('Y03 parse health', () => {
  it('reads zero or several diagnostics from each existing scan AST and transports only the count', () => {
    const root = project();
    const valid = write(root, 'src/domain/valid.ts', 'export const valid = 1;\n');
    const invalid = write(
      root,
      'src/domain/invalid.ts',
      'export const first = ;\nexport const second = ;\n'
    );
    const counted = countingTypeScript();

    const clean = scanSourceFile(
      counted.ts,
      root,
      CONFIG,
      CONFIG.rules,
      null,
      valid,
      'DomainModel'
    );
    const broken = scanSourceFile(
      counted.ts,
      root,
      CONFIG,
      CONFIG.rules,
      null,
      invalid,
      'DomainModel'
    );

    expect(clean.parseDiagnosticCount).toBe(0);
    expect(broken.parseDiagnosticCount).toBe(2);
    expect(counted.calls()).toBe(2);
    expect(broken).not.toHaveProperty('parseDiagnostics');
    expect(JSON.stringify(broken)).not.toContain('parseDiagnostics');
  });

  it('caps and sorts affected files with honest overflow while retaining exact totals', () => {
    const affected = Array.from({ length: 15 }, (_, index) => ({
      relFile: `src/domain/bad-${String(14 - index).padStart(2, '0')}.ts`,
      entry: { parseDiagnosticCount: (index % 3) + 1 },
    }));
    const clean = { relFile: 'src/domain/clean.ts', entry: { parseDiagnosticCount: 0 } };
    const forward = summarizeParseHealth([...affected, clean]);
    const reversed = summarizeParseHealth([clean, ...affected].reverse());

    expect(forward).toEqual(reversed);
    expect(forward).toMatchObject({
      advisory: true,
      available: true,
      scannedFiles: 16,
      affectedFiles: 15,
      diagnosticCount: 30,
      truncated: 3,
      overflow: true,
    });
    expect(forward.files).toHaveLength(12);
    expect(forward.files.map((entry: { file: string }) => entry.file)).toEqual(
      Array.from({ length: 12 }, (_, index) =>
        `src/domain/bad-${String(index).padStart(2, '0')}.ts`
      )
    );
    expect(summarizeParseHealth()).toMatchObject({
      available: false,
      status: 'unavailable',
      scannedFiles: 0,
      affectedFiles: 0,
    });
    const unsafe = summarizeParseHealth([
      { relFile: 'src/domain/a.ts', entry: { parseDiagnosticCount: Number.MAX_SAFE_INTEGER } },
      { relFile: 'src/domain/b.ts', entry: { parseDiagnosticCount: Number.MAX_SAFE_INTEGER } },
    ]);
    expect(unsafe).toEqual(
      summarizeParseHealth([
        { relFile: 'src/domain/b.ts', entry: { parseDiagnosticCount: Number.MAX_SAFE_INTEGER } },
        { relFile: 'src/domain/a.ts', entry: { parseDiagnosticCount: Number.MAX_SAFE_INTEGER } },
      ])
    );
    expect(unsafe).toMatchObject({
      available: false,
      status: 'unavailable',
      scannedFiles: 2,
      affectedFiles: 0,
      diagnosticCount: 0,
    });
    expect(JSON.stringify(unsafe)).not.toMatch(/Infinity|null/);
    expect(
      summarizeParseHealth([
        { relFile: 'src/domain/max.ts', entry: { parseDiagnosticCount: Number.MAX_VALUE } },
      ])
    ).toMatchObject({ available: false, status: 'unavailable', diagnosticCount: 0 });
  });

  it('invalidates v8/parser changes, preserves v9 hits, and performs no second parse', () => {
    const root = project();
    const invalid = write(root, 'src/domain/bad.ts', 'export const broken = { trailing: true,, };\n');
    const valid = write(root, 'src/infra/repo.ts', 'export const repo = 1;\n');
    const files = [invalid, valid];
    const configText = fs.readFileSync(path.join(root, 'ark.config.json'), 'utf8');
    const v8Key = crypto
      .createHash('sha1')
      .update(`ark-check-cache-v8\0${configText}\0`)
      .digest('hex');
    const cachePath = path.join(root, 'node_modules', '.cache', 'ark-check.json');
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({ key: v8Key, files: {} }));
    const counted = countingTypeScript();
    const args = { config: 'ark.config.json', noCache: false };

    const cold = runArchitectureScan({
      root,
      config: CONFIG,
      manifest: null,
      rules: CONFIG.rules,
      files,
      ts: counted.ts,
      args,
    });
    expect(counted.calls()).toBe(2);
    expect(cold.parseHealth).toMatchObject({
      affectedFiles: 1,
      diagnosticCount: 1,
      scannedFiles: 2,
    });
    expect(cold.violations).toEqual([]);

    const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    const v9Key = crypto
      .createHash('sha1')
      .update(`ark-check-cache-v9\0${counted.ts.version}\0${configText}\0`)
      .digest('hex');
    expect(cache.key).toBe(v9Key);
    expect(cache.key).not.toBe(v8Key);
    for (const entry of Object.values(cache.files) as Array<Record<string, unknown>>) {
      expect(entry).toHaveProperty('parseDiagnosticCount');
      expect(entry).not.toHaveProperty('parseDiagnostics');
    }

    const warm = runArchitectureScan({
      root,
      config: CONFIG,
      manifest: null,
      rules: CONFIG.rules,
      files,
      ts: counted.ts,
      args,
    });
    expect(counted.calls()).toBe(2);
    expect(warm.parseHealth).toEqual(cold.parseHealth);
    expect(warm.violations).toEqual(cold.violations);

    const incompleteCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    delete incompleteCache.files['src/domain/bad.ts'].parseDiagnosticCount;
    fs.writeFileSync(cachePath, JSON.stringify(incompleteCache));
    const repaired = runArchitectureScan({
      root,
      config: CONFIG,
      manifest: null,
      rules: CONFIG.rules,
      files,
      ts: counted.ts,
      args,
    });
    expect(counted.calls()).toBe(3);
    expect(repaired.parseHealth).toEqual(cold.parseHealth);

    const unsafeCache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    unsafeCache.files['src/infra/repo.ts'].parseDiagnosticCount = Number.MAX_VALUE;
    fs.writeFileSync(cachePath, JSON.stringify(unsafeCache));
    const safeAgain = runArchitectureScan({
      root,
      config: CONFIG,
      manifest: null,
      rules: CONFIG.rules,
      files,
      ts: counted.ts,
      args,
    });
    expect(counted.calls()).toBe(4);
    expect(safeAgain.parseHealth).toEqual(cold.parseHealth);

    const otherParser = countingTypeScript(`${ts.version}-other`);
    const reparsedForIdentity = runArchitectureScan({
      root,
      config: CONFIG,
      manifest: null,
      rules: CONFIG.rules,
      files,
      ts: otherParser.ts,
      args,
    });
    expect(otherParser.calls()).toBe(2);
    expect(reparsedForIdentity.parseHealth).toEqual(cold.parseHealth);
  });

  it('keeps the non-strict exit advisory while JSON/plan/strict fail parse-incomplete analysis', () => {
    const root = project();
    write(
      root,
      'src/domain/bad.ts',
      'export const first = ;\nexport const second = ;\n'
    );
    write(root, 'src/infra/repo.ts', 'export const repo = 1;\n');

    const check = runCli(root, ['--json', '--no-cache']);
    expect(check.status, check.stderr).toBe(0);
    expect(JSON.parse(check.stdout)).toMatchObject({
      ok: false,
      valid: false,
      completeness: 'partial',
      violations: [],
    });

    const planRun = runCli(root, ['--plan', '--json', '--no-cache']);
    expect(planRun.status, planRun.stderr).toBe(0);
    expect(JSON.parse(planRun.stdout)).toMatchObject({
      ok: false,
      plan: {
        completeness: 'partial',
        goal: { met: false },
      },
    });

    const doctorRun = runCli(root, ['--doctor', '--json', '--no-cache']);
    expect(doctorRun.status, doctorRun.stderr).toBe(0);
    const doctor = JSON.parse(doctorRun.stdout).doctor;
    expect(doctor.completeness).toBe('partial');
    expect(doctor.parseHealth).toMatchObject({
      advisory: true,
      available: true,
      scannedFiles: 2,
      affectedFiles: 1,
      diagnosticCount: 2,
      files: [{ file: 'src/domain/bad.ts', diagnosticCount: 2 }],
      truncated: 0,
      overflow: false,
    });
    expect(doctor.violations.active).toBe(0);
    expect(doctor.designFitness.designWeak).toBe(false);
    expect(doctor.designSmells).toEqual([]);
    expect(doctor.postGreenPath).toBeNull();
    expect(doctor.pilotLoop.active).toBe(false);

    const human = runCli(root, ['--doctor', '--no-cache']);
    expect(human.status, human.stderr).toBe(0);
    expect(human.stdout).toContain('Parse health (analysis completeness)');
    expect(human.stdout).toContain('src/domain/bad.ts');
    expect(human.stdout).toMatch(/2 parse diagnostic/i);
    expect(human.stdout).toMatch(/analysis incomplete/i);

    const report = runCli(root, [
      '--report',
      'parse-health.html',
      '--no-cache',
      '--no-open',
      '--no-archive',
    ]);
    expect(report.status, report.stderr).toBe(0);
    const html = fs.readFileSync(path.join(root, 'parse-health.html'), 'utf8');
    expect(html).toContain('data-advisory="parseHealth"');
    expect(html).toContain('src/domain/bad.ts');
    expect(html).toMatch(/2 parse diagnostic/i);
  });

  it('teaches the shipped explore skill not to call affected files clean', () => {
    const skill = fs.readFileSync(path.resolve('templates/skills/ark-explore.md'), 'utf8');
    expect(skill).toContain('doctor.parseHealth.affectedFiles > 0');
    expect(skill).toMatch(/never describe them as clean/i);
    expect(skill).toMatch(/does not change the gate verdict/i);
  });
});
