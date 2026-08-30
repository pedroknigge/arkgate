/**
 * LPD tooling I/O — the walk, the git rename set, the existence probe and the
 * `--write` pass, exercised in process.
 *
 * The CLI test drives the same code through a spawned `ark-check`, which proves
 * the wiring but cannot reach the refusals: an unreadable directory, a hard
 * link, a file that is not UTF-8. Those are the branches that stand between a
 * mutating pass and someone else's file, so they are asserted directly.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  DEFAULT_MAX_DRIFT_FILES,
  aliasPrefixesFromTsconfig,
  collectDriftFiles,
  deriveScanRoots,
  gitRenameSet,
  makeExistsProbe,
  scanLiteralPathDrift,
  writeLiteralPathDrift,
} from '../../../bin/lib/literal-path-drift-io.mjs';

const temps: string[] = [];

function tempRoot(prefix = 'ark-lpd-io-'): string {
  // realpath: on macOS os.tmpdir() hides behind /private, and every containment
  // check in the module decides on the real path.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  temps.push(root);
  return root;
}

function write(root: string, relative: string, content: string | Buffer) {
  const absolute = path.join(root, relative);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, content);
  return absolute;
}

function git(cwd: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

afterEach(() => {
  while (temps.length > 0) {
    fs.rmSync(temps.pop() as string, { recursive: true, force: true });
  }
});

describe('collectDriftFiles — no silent discards', () => {
  it('counts every refusal by reason', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// ok\n');
    write(root, 'src/big.ts', 'x'.repeat(600 * 1024));
    write(root, 'src/generated/api.ts', '// generated\n');
    write(root, 'src/inventory.generated.ts', '// generated\n');
    write(root, 'src/image.png', 'not text');
    write(root, 'outside.ts', '// top level\n');
    fs.symlinkSync(path.join(root, 'src/a.ts'), path.join(root, 'src/linked.ts'));
    fs.mkdirSync(path.join(root, 'src/real-dir'), { recursive: true });
    fs.symlinkSync(path.join(root, 'src/real-dir'), path.join(root, 'src/linked-dir'));
    // 13 levels: one past MAX_WALK_DEPTH.
    write(root, `src/${'d/'.repeat(13)}deep.ts`, '// deep\n');

    const result = collectDriftFiles(root);
    const names = result.files.map((f) => f.path);
    expect(names).toContain('src/a.ts');
    expect(names).toContain('outside.ts');
    expect(names).not.toContain('src/image.png');
    expect(names).not.toContain('src/linked.ts');
    expect(result.discarded.oversize).toBe(1);
    expect(result.discarded.generated).toBe(2);
    expect(result.discarded.symlink).toBe(1);
    expect(result.discarded.symlinkDir).toBe(1);
    expect(result.discarded.depthLimited).toBeGreaterThan(0);
    expect(result.maxFiles).toBe(DEFAULT_MAX_DRIFT_FILES);
    // Sorted, so the file budget cannot silently select a different subset run
    // to run.
    expect([...names].sort()).toEqual(names);
  });

  it('counts files dropped at the file budget', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// a\n');
    write(root, 'src/b.ts', '// b\n');
    write(root, 'src/c.ts', '// c\n');
    const result = collectDriftFiles(root, { maxFiles: 1 });
    expect(result.files).toHaveLength(1);
    expect(result.discarded.budget).toBe(2);
  });

  it('counts an unreadable directory instead of throwing', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// a\n');
    const locked = path.join(root, 'src/locked');
    fs.mkdirSync(locked);
    write(root, 'src/locked/b.ts', '// b\n');
    fs.chmodSync(locked, 0o000);
    try {
      const result = collectDriftFiles(root);
      expect(result.discarded.unreadable).toBeGreaterThan(0);
      expect(result.files.map((f) => f.path)).toContain('src/a.ts');
    } finally {
      fs.chmodSync(locked, 0o755);
    }
  });
});

describe('makeExistsProbe', () => {
  it('answers for files and directories inside the root only', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// a\n');
    const probe = makeExistsProbe(root);
    expect(probe('src/a.ts')).toBe(true);
    expect(probe('src')).toBe(true);
    expect(probe('src/missing.ts')).toBe(false);
    expect(probe('')).toBe(false);
    expect(probe(undefined as unknown as string)).toBe(false);
    // A path that climbs out is not this tree's business.
    expect(probe('../../../etc/passwd')).toBe(false);
    expect(probe('/etc/passwd')).toBe(false);
  });

  it('refuses to answer about another tree through a symlink', () => {
    const root = tempRoot();
    const outside = tempRoot('ark-lpd-outside-');
    write(outside, 'secret.ts', '// not ours\n');
    fs.symlinkSync(outside, path.join(root, 'vendor'));
    const probe = makeExistsProbe(root);
    // The link resolves, but not inside the root — a "yes" here would suppress
    // a real finding by claiming the reference is live.
    expect(probe('vendor/secret.ts')).toBe(false);
  });
});

describe('gitRenameSet', () => {
  function seedRepo(): string {
    const root = tempRoot('ark-lpd-git-');
    write(root, 'src/old/thing.ts', 'export const t = 1;\n');
    git(root, ['init', '-q', '-b', 'main', '.']);
    git(root, ['config', 'user.email', 'harness@example.test']);
    git(root, ['config', 'user.name', 'harness']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'base']);
    return root;
  }

  it('reads a staged rename against the working tree', () => {
    const root = seedRepo();
    fs.mkdirSync(path.join(root, 'src/new'), { recursive: true });
    git(root, ['mv', 'src/old/thing.ts', 'src/new/thing.ts']);
    const result = gitRenameSet(root, 'HEAD');
    expect(result.available).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.renames).toEqual([{ from: 'src/old/thing.ts', to: 'src/new/thing.ts' }]);
  });

  it('names the reason it could not build a rename set', () => {
    const root = seedRepo();
    expect(gitRenameSet(root, undefined).reason).toBe('no-base-ref');
    expect(gitRenameSet(root, '').reason).toBe('no-base-ref');
    // Ref-shaped values that are not refs, and shapes safeRef must never pass
    // to git at all.
    for (const hostile of ['--upload-pack=x', 'a b', 'ref..other', 'a;touch x', 'a{b}']) {
      expect(gitRenameSet(root, hostile).reason, hostile).toBe('no-base-ref');
    }
    expect(gitRenameSet(root, 'no-such-ref').reason).toBe('unknown-base-ref');
    expect(gitRenameSet(tempRoot('ark-lpd-nogit-'), 'HEAD').reason).toBe('not-a-git-repository');
  });

  it('re-expresses renames relative to a sub-root, and drops those outside it', () => {
    const root = tempRoot('ark-lpd-mono-');
    write(root, 'packages/app/src/old/thing.ts', 'export const t = 1;\n');
    write(root, 'packages/other/src/x.ts', 'export const x = 1;\n');
    git(root, ['init', '-q', '-b', 'main', '.']);
    git(root, ['config', 'user.email', 'harness@example.test']);
    git(root, ['config', 'user.name', 'harness']);
    git(root, ['add', '-A']);
    git(root, ['commit', '-qm', 'base']);
    fs.mkdirSync(path.join(root, 'packages/app/src/new'), { recursive: true });
    fs.mkdirSync(path.join(root, 'packages/other/src/moved'), { recursive: true });
    git(root, ['mv', 'packages/app/src/old/thing.ts', 'packages/app/src/new/thing.ts']);
    git(root, ['mv', 'packages/other/src/x.ts', 'packages/other/src/moved/x.ts']);

    const result = gitRenameSet(path.join(root, 'packages/app'), 'HEAD');
    expect(result.available).toBe(true);
    expect(result.renames).toEqual([{ from: 'src/old/thing.ts', to: 'src/new/thing.ts' }]);
  });
});

describe('aliasPrefixesFromTsconfig', () => {
  it('reads JSONC with comments and trailing commas', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'src'));
    write(
      root,
      'tsconfig.json',
      [
        '{',
        '  /* block comment */',
        '  "compilerOptions": {',
        '    // line comment',
        '    "baseUrl": ".",',
        '    "paths": {',
        '      "@/*": ["src/*"],',
        '      "@app/*": ["src/app/*"],',
        '    },',
        '  },',
        '}',
      ].join('\n')
    );
    expect(aliasPrefixesFromTsconfig(root)).toEqual({ '@/': 'src/', '@app/': 'src/app/' });
  });

  it('skips aliases it cannot rewrite one-directionally', () => {
    const root = tempRoot();
    write(
      root,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          baseUrl: './src',
          paths: {
            '@one/*': ['a/*'],
            '@many/*': ['a/*', 'b/*'],
            '@exact': ['a.ts'],
          },
        },
      })
    );
    expect(aliasPrefixesFromTsconfig(root)).toEqual({ '@one/': 'src/a/' });
  });

  it('falls back to the @/ convention only when src exists', () => {
    const withSrc = tempRoot();
    fs.mkdirSync(path.join(withSrc, 'src'));
    expect(aliasPrefixesFromTsconfig(withSrc)).toEqual({ '@/': 'src/' });
    expect(aliasPrefixesFromTsconfig(tempRoot())).toEqual({});
  });

  it('refuses a --tsconfig that points outside the root', () => {
    const root = tempRoot();
    const outside = tempRoot('ark-lpd-ts-outside-');
    write(outside, 'tsconfig.json', JSON.stringify({ compilerOptions: { paths: { '@x/*': ['y/*'] } } }));
    expect(aliasPrefixesFromTsconfig(root, path.join(outside, 'tsconfig.json'))).toEqual({});
  });
});

describe('deriveScanRoots', () => {
  it('unions the top-level directories with the children of each include root', () => {
    const root = tempRoot();
    fs.mkdirSync(path.join(root, 'src/components'), { recursive: true });
    fs.mkdirSync(path.join(root, 'src/lib'), { recursive: true });
    fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
    fs.mkdirSync(path.join(root, 'node_modules/pkg'), { recursive: true });
    fs.mkdirSync(path.join(root, '.hidden'), { recursive: true });
    expect(deriveScanRoots(root, ['src'])).toEqual(['components', 'docs', 'lib', 'src']);
    // A missing include root is not an error, just no extra roots.
    expect(deriveScanRoots(root, ['nope'])).toEqual(['docs', 'src']);
  });
});

describe('writeLiteralPathDrift — refuses rather than risks the file', () => {
  function driftedRepo(): { root: string; findings: unknown[] } {
    const root = tempRoot();
    write(root, 'src/new/thing.ts', 'export const t = 1;\n');
    write(root, 'src/a.ts', '// see src/old/thing.ts here\n');
    const report = scanLiteralPathDrift(root, { include: ['src'] }, { baseRef: null });
    // No git here, so anchor the findings by hand through the same domain path
    // the CLI uses.
    return { root, findings: report.anchored };
  }

  it('skips a finding whose file is outside the root', () => {
    const { root } = driftedRepo();
    const result = writeLiteralPathDrift(root, [
      {
        file: '../escape.ts',
        line: 1,
        column: 1,
        token: 'src/old/thing.ts',
        suggestedToken: 'src/new/thing.ts',
      },
    ]);
    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([{ file: '../escape.ts', reason: 'outside-root', count: 1 }]);
  });

  it('ignores a finding with nothing to write', () => {
    const { root } = driftedRepo();
    const result = writeLiteralPathDrift(root, [
      { file: 'src/a.ts', line: 1, column: 1, token: 'x', suggestedToken: null },
      null,
    ]);
    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([]);
  });

  it('skips a symlink, a hard link, and a file that is not UTF-8', () => {
    const root = tempRoot();
    const outside = tempRoot('ark-lpd-victim-');
    const source = '// see src/old/thing.ts here\n';
    const victim = path.join(outside, 'victim.ts');
    fs.writeFileSync(victim, source);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.symlinkSync(victim, path.join(root, 'src/soft.ts'));
    fs.linkSync(victim, path.join(root, 'src/hard.ts'));
    const binary = Buffer.concat([Buffer.from(source, 'utf8'), Buffer.from([0xff])]);
    fs.writeFileSync(path.join(root, 'src/binary.ts'), binary);

    const finding = (file: string) => ({
      file,
      line: 1,
      column: 8,
      token: 'src/old/thing.ts',
      suggestedToken: 'src/new/thing.ts',
    });
    const result = writeLiteralPathDrift(root, [
      finding('src/soft.ts'),
      finding('src/hard.ts'),
      finding('src/binary.ts'),
    ]);

    expect(result.written).toEqual([]);
    const reasons = Object.fromEntries(result.skipped.map((s: any) => [s.file, s.reason]));
    expect(reasons['src/soft.ts']).toBe('symlink');
    expect(reasons['src/hard.ts']).toBe('hard-link');
    expect(reasons['src/binary.ts']).toBe('not-utf8');
    // Nothing outside the root changed, and the invalid byte survived.
    expect(fs.readFileSync(victim, 'utf8')).toBe(source);
    expect(fs.readFileSync(path.join(root, 'src/binary.ts'))).toEqual(binary);
  });

  it('writes what still matches and keeps the rest, reporting both', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// see src/old/thing.ts and src/gone/other.ts\n');
    const result = writeLiteralPathDrift(root, [
      {
        file: 'src/a.ts',
        line: 1,
        column: 8,
        token: 'src/old/thing.ts',
        suggestedToken: 'src/new/thing.ts',
      },
      {
        // Stale: nothing at this column any more.
        file: 'src/a.ts',
        line: 1,
        column: 1,
        token: 'src/gone/other.ts',
        suggestedToken: 'src/moved/other.ts',
      },
    ]);
    expect(result.written).toHaveLength(1);
    expect(result.written[0].applied).toBe(1);
    expect(result.written[0].appliedFindings).toEqual([
      { file: 'src/a.ts', line: 1, column: 8, token: 'src/old/thing.ts' },
    ]);
    expect(result.skipped).toEqual([{ file: 'src/a.ts', reason: 'token-moved', count: 1 }]);
    expect(fs.readFileSync(path.join(root, 'src/a.ts'), 'utf8')).toBe(
      '// see src/new/thing.ts and src/gone/other.ts\n'
    );
  });

  it('reports token-moved for a file where nothing matched', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// unrelated\n');
    const result = writeLiteralPathDrift(root, [
      {
        file: 'src/a.ts',
        line: 1,
        column: 1,
        token: 'src/old/thing.ts',
        suggestedToken: 'src/new/thing.ts',
      },
    ]);
    expect(result.written).toEqual([]);
    expect(result.skipped).toEqual([{ file: 'src/a.ts', reason: 'token-moved', count: 1 }]);
    expect(fs.readFileSync(path.join(root, 'src/a.ts'), 'utf8')).toBe('// unrelated\n');
  });
});

describe('scanLiteralPathDrift', () => {
  it('reports the scan budget and an unavailable rename set without failing', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// see src/gone/thing.ts\n');
    const report = scanLiteralPathDrift(root, { include: ['src'] }, { baseRef: null });
    expect(report.renameSet).toEqual({ available: false, reason: 'no-base-ref', renames: 0 });
    expect(report.anchored).toEqual([]);
    expect(report.unanchoredCount).toBe(1);
    expect(report.scan.maxFiles).toBe(DEFAULT_MAX_DRIFT_FILES);
    expect(report.scan.maxTotalBytes).toBeGreaterThan(0);
  });

  it('ignores contract entries that name no usable root', () => {
    const root = tempRoot();
    write(root, 'src/a.ts', '// see src/gone/thing.ts\n');
    const report = scanLiteralPathDrift(
      root,
      { include: ['.', '', 42 as unknown as string, 'src'] },
      { baseRef: null }
    );
    expect(report.scannedFiles).toBe(1);
  });
});
