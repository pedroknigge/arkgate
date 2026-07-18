import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RELEASE_OUTPUT_MARKER,
  defaultReleaseOutput,
  prepareReleaseOutput,
  validateReleaseOutput,
} from '../../../scripts/release-output-safety.mjs';

const repositoryRoot = process.cwd();

describe('Z01 release output safety', () => {
  it.each([
    ['literal --out .', '.'],
    ['repository root', repositoryRoot],
    ['repository parent', path.dirname(repositoryRoot)],
    ['filesystem root', path.parse(repositoryRoot).root],
  ])('rejects the %s before mutation', (_label, output) => {
    expect(() => validateReleaseOutput(output, repositoryRoot)).toThrow(/unsafe release output/i);
  });

  it('rejects an existing directory without ArkGate ownership', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-unowned-'));
    const sentinel = path.join(parent, 'keep.txt');
    fs.writeFileSync(sentinel, 'owned by caller');
    try {
      expect(() => prepareReleaseOutput(parent, repositoryRoot)).toThrow(/not owned by ArkGate/i);
      expect(fs.readFileSync(sentinel, 'utf8')).toBe('owned by caller');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('rejects a symlink without touching its target', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-symlink-'));
    const target = path.join(parent, 'target');
    const output = path.join(parent, 'output');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'keep.txt'), 'target content');
    fs.symlinkSync(target, output, 'dir');
    try {
      expect(() => prepareReleaseOutput(output, repositoryRoot)).toThrow(/symbolic link/i);
      expect(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8')).toBe('target content');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('rejects an existing output reached through a symlink ancestor', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-ancestor-'));
    const fakeRepository = path.join(parent, 'repository');
    const external = path.join(parent, 'external');
    const canonicalOutput = path.join(external, 'existing', 'artifacts');
    const escapedOutput = path.join(fakeRepository, 'escape', 'existing', 'artifacts');
    fs.mkdirSync(fakeRepository);
    prepareReleaseOutput(canonicalOutput, fakeRepository);
    fs.writeFileSync(path.join(canonicalOutput, 'keep.txt'), 'external content');
    fs.symlinkSync(external, path.join(fakeRepository, 'escape'), 'dir');
    try {
      expect(() => prepareReleaseOutput(escapedOutput, fakeRepository)).toThrow(/escapes .* boundary/i);
      expect(fs.readFileSync(path.join(canonicalOutput, 'keep.txt'), 'utf8')).toBe('external content');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('creates a marked output and only resets that owned directory', () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-owned-'));
    const output = path.join(parent, 'artifacts');
    const outside = path.join(parent, 'keep.txt');
    fs.writeFileSync(outside, 'outside');
    try {
      prepareReleaseOutput(output, repositoryRoot);
      expect(fs.existsSync(path.join(output, RELEASE_OUTPUT_MARKER))).toBe(true);
      fs.mkdirSync(path.join(output, 'gate'));
      fs.writeFileSync(path.join(output, 'gate', 'old-artifact.txt'), 'old');
      fs.writeFileSync(path.join(output, 'caller-owned.txt'), 'caller');

      prepareReleaseOutput(output, repositoryRoot);

      expect(fs.existsSync(path.join(output, 'gate'))).toBe(false);
      expect(fs.existsSync(path.join(output, RELEASE_OUTPUT_MARKER))).toBe(true);
      expect(fs.readFileSync(path.join(output, 'caller-owned.txt'), 'utf8')).toBe('caller');
      expect(fs.readFileSync(outside, 'utf8')).toBe('outside');
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  });

  it('preserves an unmarked legacy default and selects a marked child for reruns', () => {
    const fakeRepository = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-legacy-'));
    const legacyOutput = path.join(fakeRepository, 'release', 'artifacts');
    const sentinel = path.join(legacyOutput, 'legacy-report.json');
    fs.mkdirSync(legacyOutput, { recursive: true });
    fs.writeFileSync(sentinel, 'legacy');
    try {
      const output = defaultReleaseOutput(fakeRepository);
      expect(output).toBe(path.join(legacyOutput, 'arkgate-owned'));

      prepareReleaseOutput(output, fakeRepository);

      expect(fs.readFileSync(sentinel, 'utf8')).toBe('legacy');
      expect(fs.existsSync(path.join(output, RELEASE_OUTPUT_MARKER))).toBe(true);
      expect(defaultReleaseOutput(fakeRepository)).toBe(output);
    } finally {
      fs.rmSync(fakeRepository, { recursive: true, force: true });
    }
  });
});
