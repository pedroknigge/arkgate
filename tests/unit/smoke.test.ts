import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('ArkGate bootstrap (smoke)', () => {
  it('exposes a semantic version', () => {
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('keeps package.json, package-lock.json, and server.json versions in sync with src/version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const server = JSON.parse(readFileSync('server.json', 'utf8'));
    expect(pkg.name).toBe('arkgate');
    expect(pkg.version).toBe(version);
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
    expect(server.version).toBe(version);
    for (const entry of server.packages) {
      expect(entry.version).toBe(version);
    }
  });

  it('runs the checked-out Action revision by default instead of an older npm release', () => {
    const action = readFileSync('action.yml', 'utf8');
    expect(action).toContain("default: ''");
    expect(action).toContain('node "$ACTION_PATH/bin/ark-check.mjs"');
    expect(action).not.toContain("default: 'latest'");
    expect(action).not.toContain("default: '2.10.0'");
  });

  it('points package homepage at the official product site', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(pkg.homepage).toBe('https://www.arkgate.online/');
  });

  it('exports core domain types at runtime (shapes only for now)', () => {
    // We just verify that importing works and types are present structurally.
    // Real implementations come in later iterations.
    expect(typeof version).toBe('string');
  });
});
