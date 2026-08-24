import { describe, expect, it } from 'vitest';
import { parseArgs, resolveDesignDeltaBaseRef } from '../../../bin/lib/check-args.mjs';

describe('ark-check args (extracted)', () => {
  it('parses --strict as merge+gates+config and keeps --watch', () => {
    const args = parseArgs(['node', 'ark-check', '--strict', '--watch', '--json']);
    expect(args.strictMerge).toBe(true);
    expect(args.requireGates).toBe(true);
    expect(args.strictConfig).toBe(true);
    expect(args.watch).toBe(true);
    expect(args.json).toBe(true);
  });

  it('prefers explicit base-ref over env', () => {
    expect(resolveDesignDeltaBaseRef('/tmp', 'origin/main', { GITHUB_BASE_REF: 'dev' })).toBe(
      'origin/main'
    );
    expect(resolveDesignDeltaBaseRef('/tmp', undefined, { GITHUB_BASE_REF: 'dev' })).toBe(
      'origin/dev'
    );
  });
});
