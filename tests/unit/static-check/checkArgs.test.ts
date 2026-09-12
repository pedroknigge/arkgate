import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_STRICT_MERGE_MESSAGE,
  LOCAL_TREE_MODE_MESSAGE,
  applyLocalCheckMode,
  envFlagOn,
  localCheckEnvelope,
  parseArgs,
  resolveDesignDeltaBaseRef,
} from '../../../bin/lib/check-args.mjs';

describe('ark-check args (extracted)', () => {
  it('parses --strict as merge+gates+config and keeps --watch', () => {
    const args = parseArgs(['node', 'ark-check', '--strict', '--watch', '--json'], {});
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

describe('LC01 --local / ARK_CHECK_LOCAL branches', () => {
  it('envFlagOn accepts 1/true/yes and ignores the rest', () => {
    expect(envFlagOn(undefined)).toBe(false);
    expect(envFlagOn(null)).toBe(false);
    expect(envFlagOn('')).toBe(false);
    expect(envFlagOn('0')).toBe(false);
    expect(envFlagOn('false')).toBe(false);
    expect(envFlagOn('no')).toBe(false);
    expect(envFlagOn('off')).toBe(false);
    expect(envFlagOn('maybe')).toBe(false);
    expect(envFlagOn('1')).toBe(true);
    expect(envFlagOn('true')).toBe(true);
    expect(envFlagOn('YES')).toBe(true);
    expect(envFlagOn(' True ')).toBe(true);
  });

  it('localCheckEnvelope is empty unless local is on', () => {
    expect(localCheckEnvelope(undefined, '/tmp')).toEqual({});
    expect(localCheckEnvelope(null, '/tmp')).toEqual({});
    expect(localCheckEnvelope({ local: false }, '/tmp')).toEqual({});
    expect(localCheckEnvelope({ local: true }, '/tmp/project')).toEqual({
      local: true,
      scope: 'changed',
      analysisRoot: path.resolve('/tmp/project'),
    });
  });

  it('applyLocalCheckMode covers CI ignore, report-mode ignore, and explicit refuse', () => {
    expect(applyLocalCheckMode({ local: false, changed: false })).toEqual({
      local: false,
      changed: false,
    });

    const enabled = applyLocalCheckMode({ local: false, changed: false }, { ARK_CHECK_LOCAL: 'yes' });
    expect(enabled.local).toBe(true);
    expect(enabled.changed).toBe(true);

    const ciEnv = applyLocalCheckMode(
      { local: false, strictMerge: true, changed: false },
      { ARK_CHECK_LOCAL: '1' }
    );
    expect(ciEnv.local).toBe(false);
    expect(ciEnv.changed).toBe(false);

    expect(() =>
      applyLocalCheckMode({ local: true, strictMerge: true }, {})
    ).toThrow(LOCAL_STRICT_MERGE_MESSAGE);

    const treeFlags = ['doctor', 'coverage', 'plan', 'report', 'promote'] as const;
    for (const flag of treeFlags) {
      const ignored = applyLocalCheckMode(
        { local: false, changed: false, [flag]: true },
        { ARK_CHECK_LOCAL: '1' }
      );
      expect(ignored.local, flag).toBe(false);
      expect(ignored.changed, flag).toBe(false);
      expect(() => applyLocalCheckMode({ local: true, [flag]: true }, {})).toThrow(
        LOCAL_TREE_MODE_MESSAGE
      );
    }
  });

  it('parseArgs refuses each explicit --local report mode and ignores leftover env', () => {
    expect(() => parseArgs(['node', 'ark-check', '--local', '--coverage'], {})).toThrow(
      LOCAL_TREE_MODE_MESSAGE
    );
    expect(() => parseArgs(['node', 'ark-check', '--local', '--plan'], {})).toThrow(
      LOCAL_TREE_MODE_MESSAGE
    );
    expect(() => parseArgs(['node', 'ark-check', '--local', '--report'], {})).toThrow(
      LOCAL_TREE_MODE_MESSAGE
    );
    expect(() => parseArgs(['node', 'ark-check', '--local', '--promote'], {})).toThrow(
      LOCAL_TREE_MODE_MESSAGE
    );

    const leftover = parseArgs(['node', 'ark-check', '--doctor'], { ARK_CHECK_LOCAL: '1' });
    expect(leftover.doctor).toBe(true);
    expect(leftover.local).toBe(false);
    expect(leftover.changed).toBe(false);
  });
});
