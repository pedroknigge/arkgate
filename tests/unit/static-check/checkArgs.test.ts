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
    const prevLocal = process.env.ARK_CHECK_LOCAL;
    delete process.env.ARK_CHECK_LOCAL;
    try {
      const fromDefaultEnv = parseArgs(['node', 'ark-check']);
      expect(fromDefaultEnv.local).toBe(false);
      expect(fromDefaultEnv.changed).toBe(false);
    } finally {
      if (prevLocal === undefined) delete process.env.ARK_CHECK_LOCAL;
      else process.env.ARK_CHECK_LOCAL = prevLocal;
    }

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

  it('parseArgs: --local reuses --changed; default env; leftover falsey env', () => {
    const both = parseArgs(['node', 'ark-check', '--local', '--changed', '--base', 'HEAD'], {});
    expect(both.local).toBe(true);
    expect(both.changed).toBe(true);
    expect(both.base).toBe('HEAD');

    const defaultEnv = parseArgs(['node', 'ark-check', '--local', '--base', 'main']);
    expect(defaultEnv.local).toBe(true);
    expect(defaultEnv.changed).toBe(true);

    expect(envFlagOn(1)).toBe(true);
    expect(envFlagOn(true)).toBe(true);
    const already = applyLocalCheckMode({ local: true, changed: false }, { ARK_CHECK_LOCAL: '1' });
    expect(already.local).toBe(true);
    expect(already.changed).toBe(true);

    for (const off of ['0', 'false', 'no', 'off', '', '2']) {
      const ignored = parseArgs(['node', 'ark-check'], { ARK_CHECK_LOCAL: off });
      expect(ignored.local, off).toBe(false);
      expect(ignored.changed, off).toBe(false);
    }
  });

  it('resolveDesignDeltaBaseRef walks explicit / policy-env / GitHub / discover', () => {
    expect(resolveDesignDeltaBaseRef('/tmp', '  origin/dev  ', {})).toBe('origin/dev');
    expect(
      resolveDesignDeltaBaseRef('/tmp', '   ', { ARK_POLICY_BASE_REF: 'origin/feat' })
    ).toBe('origin/feat');
    expect(
      resolveDesignDeltaBaseRef('/tmp', undefined, {
        ARK_POLICY_BASE_REF: '0'.repeat(40),
        GITHUB_BASE_REF: '  release  ',
      })
    ).toBe('origin/release');
    expect(resolveDesignDeltaBaseRef('/tmp', undefined, { GITHUB_BASE_REF: '   ' })).toBeUndefined();
    expect(
      resolveDesignDeltaBaseRef('/tmp', undefined, { GITHUB_BASE_REF: 1 as unknown as string })
    ).toBeUndefined();
    const discovered = resolveDesignDeltaBaseRef(process.cwd(), undefined, {});
    expect(discovered === undefined || typeof discovered === 'string').toBe(true);
  });

  it('parseArgs walks cheap-check neighbors and refuse/optional-value branches', () => {
    const walked = parseArgs(
      [
        'node',
        'ark-check',
        '--json',
        '--strict-config',
        '--require-gates',
        '--require-write-hook',
        'cursor',
        '--init',
        '--preset',
        'hexagonal',
        '--install-agent-gates',
        '--compact',
        '--tools',
        'claude,,CURSOR',
        '--force',
        '--follow-config-root',
        '--skills-only',
        '--rules-inventory',
        '--path-drift',
        '--sensors',
        '--recommend',
        '--write-plan',
        '--list-policy-packs',
        '--apply-policy-pack',
        'hexagonal',
        '--suggest-include',
        '--adopt-contract',
        '--migrate-contract',
        '--ratchet-cores',
        '--write',
        '--watch',
        '--beginner',
        '--codex-home',
        '--prune-home-duplicates',
        '--claude-home',
        '--grok-home',
        '--antigravity-home',
        '--migrate-commands',
        '--no-cache',
        '--resident',
        '--reset-origin',
        '--no-archive',
        '--open',
        '--no-open',
        '--baseline',
        '.ark-baseline.json',
        '--policy-base',
        'base.json',
        '--policy-base-ref',
        'main',
        '--policy-ack',
        'ack.json',
        '--fail-on-new-smells',
        '--base-ref',
        'origin/main',
        '--contract-session',
        '--contract-diff',
        '--changed',
        '--against',
        'main',
        '--base',
        'HEAD',
        '--persona',
        'contributor',
        '--author',
        'pedroknigge',
        '--root',
        '/tmp/ark-local-dx',
        '--config',
        'ark.config.json',
        '--manifest',
        'ark.manifest.json',
        '--print-config',
        'eleven-layer',
        '--tsconfig',
        'tsconfig.json',
        '--help',
        '--all',
        '--version',
      ],
      {}
    );
    expect(walked.changed).toBe(true);
    expect(walked.local).toBe(false);
    expect(walked.tools).toEqual(['claude', 'cursor']);
    expect(walked.requireWriteHook).toBe('cursor');
    expect(walked.printConfig).toBe('eleven-layer');
    expect(walked.root).toBe(path.resolve('/tmp/ark-local-dx'));
    expect(walked.help).toBe(true);
    expect(walked.version).toBe(true);

    const homes = parseArgs(['node', 'ark-check', '--agent-homes', '-h', '-V'], {});
    expect(homes.agentHomes).toBe(true);
    expect(homes.codexHome).toBe(true);
    expect(homes.help).toBe(true);
    expect(homes.version).toBe(true);

    const toolsBare = parseArgs(['node', 'ark-check', '--tools', '--force'], {});
    expect(toolsBare.tools).toEqual([]);
    expect(toolsBare.force).toBe(true);

    const promoteEq = parseArgs(['node', 'ark-check', '--promote=-rule', '--apply'], {});
    expect(promoteEq.promote).toBe('-rule');
    expect(promoteEq.apply).toBe(true);

    const promoteVal = parseArgs(['node', 'ark-check', '--promote', 'rule-a'], {});
    expect(promoteVal.promote).toBe('rule-a');

    const reportNamed = parseArgs(['node', 'ark-check', '--report', 'out.html'], {});
    expect(reportNamed.report).toBe('out.html');

    const update = parseArgs(['node', 'ark-check', '--update-baseline'], {});
    expect(update.updateBaseline).toBe(true);
    expect(update.baseline).toBe('.ark-baseline.json');

    expect(() => parseArgs(['node', 'ark-check', '--base'], {})).toThrow(/Missing value for --base/);
    expect(() => parseArgs(['node', 'ark-check', '--author', '--json'], {})).toThrow(
      /Missing value for --author/
    );
    expect(() => parseArgs(['node', 'ark-check', '--not-a-flag'], {})).toThrow(/Unknown argument/);
    expect(() => parseArgs(['node', 'ark-check', '--apply'], {})).toThrow(/--apply applies to --promote/);

    const shadowing = [
      '--sensors',
      '--path-drift',
      '--coverage',
      '--recommend',
      '--doctor',
      '--plan',
      '--rules-inventory',
      '--suggest-include',
      '--adopt-contract',
      '--migrate-contract',
    ];
    for (const flag of shadowing) {
      expect(() => parseArgs(['node', 'ark-check', '--promote', flag], {})).toThrow(
        /--promote cannot be combined/
      );
    }
    expect(() => parseArgs(['node', 'ark-check', '--promote', '--changed'], {})).toThrow(
      /narrowed or baselined/
    );
    expect(() => parseArgs(['node', 'ark-check', '--promote', '--against', 'main'], {})).toThrow(
      /narrowed or baselined/
    );
    expect(() => parseArgs(['node', 'ark-check', '--promote', '--baseline'], {})).toThrow(
      /narrowed or baselined/
    );
  });
});
