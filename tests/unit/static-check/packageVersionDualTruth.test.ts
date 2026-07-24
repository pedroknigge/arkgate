/**
 * Dual-truth: CLI shipped version vs consumer package.json pin.
 * Drives describePackageVersionDualTruth (shipped field-install helper).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(import.meta.url);
// Load Tooling helper (shipped path)
const { describePackageVersionDualTruth } = require(
  path.join(REPO, 'bin/lib/field-install.mjs')
);

describe('describePackageVersionDualTruth', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-dual-truth-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('flags PACKAGE_PIN_BEHIND_CLI when pin is older major than CLI', () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'c', devDependencies: { arkgate: '^3.8.3' } }, null, 2)
    );
    const truth = describePackageVersionDualTruth(tmp, { cliVersion: '4.0.0' });
    expect(truth.dualTruth).toBe(true);
    expect(truth.code).toBe('PACKAGE_PIN_BEHIND_CLI');
    expect(truth.cliVersion).toBe('4.0.0');
    expect(truth.declaredPin).toBe('^3.8.3');
    expect(truth.note).toMatch(/4\.0\.0/);
    expect(truth.note).toMatch(/3\.8\.3|--no-install/i);
  });

  it('reports PACKAGE_PIN_MATCHES when pin aligns with CLI', () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'c', devDependencies: { arkgate: '^4.0.0' } }, null, 2)
    );
    const truth = describePackageVersionDualTruth(tmp, { cliVersion: '4.0.0' });
    expect(truth.dualTruth).toBe(false);
    expect(truth.code).toBe('PACKAGE_PIN_MATCHES');
  });

  it('reports PACKAGE_PIN_ABSENT when no arkgate dependency', () => {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'c' }, null, 2));
    const truth = describePackageVersionDualTruth(tmp, { cliVersion: '4.0.0' });
    expect(truth.dualTruth).toBe(false);
    expect(truth.code).toBe('PACKAGE_PIN_ABSENT');
  });
});
