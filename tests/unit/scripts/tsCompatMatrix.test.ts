import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  expectedTypeScriptHost,
  managerBinaryArgs,
  managerInstallArgs,
  managerInvocation,
  parseArguments,
  parseJsonOutput,
  pathIsWithin,
  prepareConsumerProject,
  runRecordedStage,
  verifyChecksumIfPresent,
} from '../../../scripts/ts-compat-matrix.mjs';

describe('Z02 packed TypeScript compatibility harness', () => {
  it('preserves the positional local invocation and accepts an explicit CI matrix cell', () => {
    expect(parseArguments(['7.0.2'])).toMatchObject({
      packageManager: 'npm',
      typescriptVersions: ['7.0.2'],
    });
    expect(
      parseArguments([
        '--package-manager',
        'yarn',
        '--manager-version',
        '4.17.1',
        '--typescript',
        '5.9.3,6.0.3,7.0.2',
        '--tarball',
        '/tmp/arkgate.tgz',
        '--out',
        '/tmp/report.json',
      ])
    ).toMatchObject({
      packageManager: 'yarn',
      managerVersion: '4.17.1',
      typescriptVersions: ['5.9.3', '6.0.3', '7.0.2'],
      tarball: '/tmp/arkgate.tgz',
      out: '/tmp/report.json',
    });
  });

  it('pins a requested manager through Corepack without a shell', () => {
    expect(managerInvocation('npm', '10.8.0', ['install'])).toEqual({
      command: 'corepack',
      args: ['npm@10.8.0', 'install'],
    });
    expect(managerInvocation('pnpm', '9.15.0', ['exec', 'ark-check'])).toEqual({
      command: 'corepack',
      args: ['pnpm@9.15.0', 'exec', 'ark-check'],
    });
    expect(managerInvocation('yarn', undefined, ['node', 'smoke.mjs'])).toEqual({
      command: 'yarn',
      args: ['node', 'smoke.mjs'],
    });
  });

  it('prevents npm exec from downloading a missing binary', () => {
    expect(managerBinaryArgs('npm', 'ark-check', ['--version'])).toEqual([
      'exec',
      '--yes=false',
      '--',
      'ark-check',
      '--version',
    ]);
  });

  it('allows Yarn to create the ephemeral fixture lockfile in CI', () => {
    expect(managerInstallArgs('yarn')).toEqual([
      'install',
      '--mode=skip-build',
      '--no-immutable',
    ]);
  });

  it('expects project TypeScript for 5/6 and the exact ArkGate fallback for 7', () => {
    expect(expectedTypeScriptHost('5.9.3')).toEqual({
      source: 'project',
      version: '5.9.3',
      debugLine: '[ark-check] TypeScript 5.9.3 via project',
    });
    expect(expectedTypeScriptHost('6.0.3')).toEqual({
      source: 'project',
      version: '6.0.3',
      debugLine: '[ark-check] TypeScript 6.0.3 via project',
    });
    expect(expectedTypeScriptHost('7.0.2')).toEqual({
      source: 'arkgate-fallback',
      version: '6.0.3',
      debugLine: '[ark-check] TypeScript 6.0.3 via arkgate-fallback (fallback)',
    });
  });

  it('extracts the final npm-pack array after lifecycle output', () => {
    expect(
      parseJsonOutput(
        '> arkgate@3.7.0 prepack\n> npm run build\n[CJS] Build success\n[{"filename":"arkgate-3.7.0.tgz"}]\n',
        'npm pack'
      )
    ).toEqual([{ filename: 'arkgate-3.7.0.tgz' }]);
  });

  it('requires the release-artifact checksum sidecar but keeps local tarballs optional', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ts-checksum-test-'));
    const tarball = path.join(root, 'arkgate-3.7.0.tgz');
    fs.writeFileSync(tarball, 'candidate');
    try {
      expect(verifyChecksumIfPresent(tarball)).toMatchObject({ verified: false });
      expect(() => verifyChecksumIfPresent(tarball, true)).toThrow(/sidecar missing/);
      const digest = verifyChecksumIfPresent(tarball).digest;
      fs.writeFileSync(`${tarball}.sha256`, `${digest}  arkgate-3.7.0.tgz\n`);
      expect(verifyChecksumIfPresent(tarball, true)).toEqual({ digest, verified: true });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('writes a PnP consumer that references only the candidate tarball', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ts-harness-test-'));
    const candidate = path.join(root, 'candidate.tgz');
    fs.writeFileSync(candidate, 'candidate');
    const consumer = path.join(root, 'consumer');
    fs.mkdirSync(consumer);
    try {
      const manifest = prepareConsumerProject({
        root: consumer,
        candidateTarball: candidate,
        typescriptVersion: '6.0.3',
        packageManager: 'yarn',
        managerVersion: '4.17.1',
      });
      expect(manifest.devDependencies).toEqual({
        arkgate: expect.stringMatching(/^file:/),
        typescript: '6.0.3',
      });
      expect(manifest.packageManager).toBe('yarn@4.17.1');
      expect(fs.readFileSync(path.join(consumer, '.yarnrc.yml'), 'utf8')).toContain(
        'nodeLinker: pnp'
      );
      expect(fs.readFileSync(path.join(consumer, '.yarnrc.yml'), 'utf8')).toContain(
        'pnpMode: strict'
      );
      expect(fs.existsSync(path.join(consumer, 'esm-smoke.mjs'))).toBe(true);
      expect(fs.existsSync(path.join(consumer, 'cjs-schema-smoke.cjs'))).toBe(true);
      expect(fs.existsSync(path.join(consumer, 'package-smoke.ts'))).toBe(true);
      expect(fs.existsSync(path.join(consumer, '.github/workflows/ark-check.yml'))).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('uses Yarn node-modules for the native TS7 compiler instead of a hidden PnP bridge', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-ts7-yarn-test-'));
    const candidate = path.join(root, 'candidate.tgz');
    fs.writeFileSync(candidate, 'candidate');
    const consumer = path.join(root, 'consumer');
    fs.mkdirSync(consumer);
    try {
      prepareConsumerProject({
        root: consumer,
        candidateTarball: candidate,
        typescriptVersion: '7.0.2',
        packageManager: 'yarn',
        managerVersion: '4.17.1',
      });
      const yarnConfig = fs.readFileSync(path.join(consumer, '.yarnrc.yml'), 'utf8');
      expect(yarnConfig).toContain('nodeLinker: node-modules');
      expect(yarnConfig).not.toContain('pnpMode: strict');
      expect(fs.existsSync(path.join(consumer, 'tsconfig.package-smoke-pnp.json'))).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('records a failed stage and continues collecting later evidence', () => {
    const cell = { checks: {} as Record<string, unknown>, errors: [] as unknown[] };
    let laterRan = false;
    expect(
      runRecordedStage(cell, 'first', () => {
        throw new Error('expected failure');
      })
    ).toBe(false);
    expect(
      runRecordedStage(cell, 'later', () => {
        laterRan = true;
        return { evidence: 'kept' };
      })
    ).toBe(true);
    expect(laterRan).toBe(true);
    expect(cell.checks).toMatchObject({
      first: { ok: false },
      later: { ok: true, evidence: 'kept' },
    });
    expect(cell.errors).toHaveLength(1);
  });

  it('distinguishes checkout descendants from sibling temp installs', () => {
    const checkout = path.resolve('/workspace/arkgate');
    expect(pathIsWithin(checkout, path.join(checkout, 'bin/ark-check.mjs'))).toBe(true);
    expect(pathIsWithin(checkout, path.resolve('/tmp/consumer/node_modules/arkgate/package.json'))).toBe(
      false
    );
  });
});
