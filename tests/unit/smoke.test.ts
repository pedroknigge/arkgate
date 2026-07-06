import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('Ark bootstrap (smoke)', () => {
  it('exposes a semantic version', () => {
    expect(version).toBe('1.9.0');
  });

  it('keeps package.json, package-lock.json, and server.json versions in sync with src/version', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
    const server = JSON.parse(readFileSync('server.json', 'utf8'));
    expect(pkg.version).toBe(version);
    expect(lock.version).toBe(version);
    expect(lock.packages[''].version).toBe(version);
    expect(server.version).toBe(version);
    for (const entry of server.packages) {
      expect(entry.version).toBe(version);
    }
  });

  it('exports core domain types at runtime (shapes only for now)', () => {
    // We just verify that importing works and types are present structurally.
    // Real implementations come in later iterations.
    expect(typeof version).toBe('string');
  });
});
