import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { GALLERY_STARTERS } from '../../../bin/ark-shared.mjs';
import {
  assertAppliedPreview,
  assertNoStarterManagerOverrides,
  assertPreflightConsumedChange,
  assertSnapshotEqual,
  buildBenignChange,
  buildViolationChange,
  copyStarter,
  galleryReportOk,
  governedSnapshotPaths,
  parseArguments,
  prepareStarterManifest,
  snapshotProject,
} from '../../../scripts/gallery-clean-room-matrix.mjs';

const CHECKS = [
  'prepare',
  'install',
  'package-import',
  'check',
  'doctor',
  'start-preview',
  'start-apply',
  'preflight-benign',
  'strict-merge',
  'preflight-violation',
  'non-mutation',
];

function temporaryRoot(name: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), name));
}

function sha256(value: string) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

describe('Z05 gallery clean-room matrix', () => {
  it('requires one packed candidate and accepts an exact package-manager cell', () => {
    expect(
      parseArguments([
        '--artifact-dir',
        '/tmp/release/gate',
        '--package-manager',
        'pnpm',
        '--manager-version',
        '9.15.9',
        '--out',
        '/tmp/report.json',
      ])
    ).toMatchObject({
      artifactDir: '/tmp/release/gate',
      packageManager: 'pnpm',
      managerVersion: '9.15.9',
      out: '/tmp/report.json',
    });
    expect(() => parseArguments([])).toThrow('provide exactly one');
    expect(() =>
      parseArguments(['--tarball', '/tmp/a.tgz', '--artifact-dir', '/tmp/release'])
    ).toThrow('provide exactly one');
    expect(() =>
      parseArguments(['--tarball', '/tmp/a.tgz', '--package-manager', 'bun'])
    ).toThrow('unsupported package manager');
  });

  it('copies source starters without checkout install artifacts or lockfiles', () => {
    const source = temporaryRoot('ark-gallery-copy-source-');
    const destination = temporaryRoot('ark-gallery-copy-target-');
    try {
      fs.mkdirSync(path.join(source, 'src'), { recursive: true });
      fs.mkdirSync(path.join(source, 'node_modules/pkg'), { recursive: true });
      fs.writeFileSync(path.join(source, 'src/index.ts'), 'export const ok = true;\n');
      fs.writeFileSync(path.join(source, 'node_modules/pkg/index.js'), 'module.exports = 1;\n');
      fs.writeFileSync(path.join(source, 'package-lock.json'), '{}\n');

      expect(() => assertNoStarterManagerOverrides(source)).not.toThrow();
      copyStarter(source, destination);

      expect(fs.readFileSync(path.join(destination, 'src/index.ts'), 'utf8')).toContain('ok');
      expect(fs.existsSync(path.join(destination, 'node_modules'))).toBe(false);
      expect(fs.existsSync(path.join(destination, 'package-lock.json'))).toBe(false);
      fs.writeFileSync(path.join(source, '.npmrc'), 'registry=https://invalid.example\n');
      expect(() => assertNoStarterManagerOverrides(source)).toThrow('ignore or overwrite it');
    } finally {
      fs.rmSync(source, { recursive: true, force: true });
      fs.rmSync(destination, { recursive: true, force: true });
    }
  });

  it('binds the temporary manifest to the candidate tarball and exact manager', () => {
    const root = temporaryRoot('ark-gallery-manifest-');
    const tarball = path.join(root, 'candidate.tgz');
    try {
      fs.writeFileSync(
        path.join(root, 'package.json'),
        `${JSON.stringify({ name: 'starter', private: true, devDependencies: { arkgate: '^3.7.0' } })}\n`
      );
      fs.writeFileSync(tarball, 'candidate');

      const manifest = prepareStarterManifest(root, tarball, 'yarn', '4.17.1');

      expect(manifest.devDependencies.arkgate).toBe(pathToFileURL(tarball).href);
      expect(manifest.packageManager).toBe('yarn@4.17.1');
      expect(fs.readFileSync(path.join(root, '.yarnrc.yml'), 'utf8')).toContain('nodeLinker: pnp');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('accepts only the exact files and hashes named by the start preview', () => {
    const root = temporaryRoot('ark-gallery-preview-');
    try {
      fs.writeFileSync(path.join(root, 'package.json'), '{"private":true}\n');
      const before = snapshotProject(root);
      const agent = '# ArkGate Enforcement\n';
      fs.writeFileSync(path.join(root, 'AGENTS.md'), agent);
      const after = snapshotProject(root);

      expect(() =>
        assertAppliedPreview(before, after, [
          { path: 'AGENTS.md', afterHash: sha256(agent) },
        ])
      ).not.toThrow();
      expect(() => assertSnapshotEqual(after, snapshotProject(root), 'read-only command')).not.toThrow();
      fs.writeFileSync(path.join(root, 'package.json'), '{"private":false}\n');
      expect(() => assertSnapshotEqual(after, snapshotProject(root), 'read-only command')).toThrow(
        'package.json'
      );
      expect(() =>
        assertAppliedPreview(before, snapshotProject(root), [
          { path: 'AGENTS.md', afterHash: sha256(agent) },
        ])
      ).toThrow('preview named AGENTS.md');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('builds benign and denied virtual updates from the starter contract', () => {
    const root = temporaryRoot('ark-gallery-probes-');
    const config = {
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'PersistenceAdapters', patterns: ['src/adapters/**'] },
      ],
      rules: [{ from: 'DomainModel', to: 'PersistenceAdapters', allowed: false }],
    };
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/adapters'), { recursive: true });
      fs.writeFileSync(path.join(root, 'src/domain/order.ts'), 'export const order = 1;\n');
      fs.writeFileSync(path.join(root, 'src/adapters/db.ts'), 'export const db = 1;\n');

      const benign = buildBenignChange(root, config);
      const violation = buildViolationChange(root, config);

      expect(benign.path).toBe('src/adapters/db.ts');
      expect(benign.content).toContain('arkGalleryCleanRoomProbe');
      expect(violation).toMatchObject({
        fromLayer: 'DomainModel',
        toLayer: 'PersistenceAdapters',
        target: 'src/adapters/db.ts',
        change: { path: 'src/domain/order.ts' },
      });
      expect(violation.change.content).toContain("import '../adapters/db';");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('proves preflight consumed the exact complete candidate change', () => {
    const result = {
      mode: 'resolved-candidate-facts',
      baseCompleteness: 'complete',
      candidateCompleteness: 'complete',
      baseFactsHash: 'facts-before',
      candidateFactsHash: 'facts-after',
      baseTreeHash: 'tree-before',
      candidateTreeHash: 'tree-after',
      changes: [
        {
          path: 'services/api.ts',
          operation: 'update',
          beforeContentHash: 'content-before',
          candidateContentHash: 'content-after',
        },
      ],
    };

    expect(() => assertPreflightConsumedChange(result, 'services/api.ts')).not.toThrow();
    expect(() =>
      assertPreflightConsumedChange(
        { ...result, candidateFactsHash: 'facts-before' },
        'services/api.ts'
      )
    ).toThrow('facts did not change');
    expect(() => assertPreflightConsumedChange(result, 'services/other.ts')).toThrow(
      'expected update services/other.ts'
    );
  });

  it('protects governed source additions outside conventional source roots', () => {
    expect(
      governedSnapshotPaths(
        { 'package.json': 'before' },
        { 'package.json': 'before', 'services/new.ts': 'after' },
        [{ name: 'Services', patterns: ['services/**'] }]
      )
    ).toEqual(['services/new.ts']);
  });

  it('fails closed unless all six catalog cells contain every journey stage', () => {
    const cells = GALLERY_STARTERS.map((starter) => ({
      archetype: starter.archetype,
      ok: true,
      checks: Object.fromEntries(CHECKS.map((name) => [name, { ok: true }])),
    }));
    expect(galleryReportOk({ cells, errors: [] })).toBe(true);
    cells[0].checks['strict-merge'].ok = false;
    expect(galleryReportOk({ cells, errors: [] })).toBe(false);
    cells[0].checks['strict-merge'].ok = true;
    expect(galleryReportOk({ cells: cells.slice(1), errors: [] })).toBe(false);
  });
});
