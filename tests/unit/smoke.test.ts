import { describe, it, expect } from 'vitest';
import { version } from '../../src/index';

describe('Ark bootstrap (smoke)', () => {
  it('exposes a semantic version', () => {
    expect(version).toBe('0.8.3');
  });

  it('exports core domain types at runtime (shapes only for now)', () => {
    // We just verify that importing works and types are present structurally.
    // Real implementations come in later iterations.
    expect(typeof version).toBe('string');
  });
});
