/**
 * LPD end to end: `ark-check --path-drift` over a real git rename.
 *
 * Everything runs in a temp directory that is removed in a `finally` — the
 * harness must never dirty the tree it is measuring.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anchored on this module, not on process.cwd(): a vitest run from a
// subdirectory must not turn every case into "cannot find module".
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CHECK_BIN = path.join(REPO_ROOT, 'bin/ark-check.mjs');

/**
 * git with the developer's own config out of the way. A global
 * `commit.gpgsign`, `core.hooksPath`, `init.templateDir` or `core.autocrlf`
 * would otherwise change — or silently CRLF-rewrite — what this harness seeds.
 */
function git(cwd: string, args: string[]) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    },
  });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout;
}

function runDrift(root: string, extra: string[] = []) {
  const result = spawnSync('node', [CHECK_BIN, '--root', root, '--config', 'ark.config.json', '--path-drift', ...extra], {
    encoding: 'utf8',
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function runDriftJson(root: string, extra: string[] = []) {
  const run = runDrift(root, ['--json', ...extra]);
  return {
    ...run,
    payload: JSON.parse(run.stdout) as {
      pathDrift: {
        anchored: Array<{ ruleId: string; file: string; line: number; form: string; token: string; suggestedToken: string }>;
        unanchored: Array<{ ruleId: string; file: string }>;
        unanchoredCount: number;
        unanchoredListed: boolean;
        renameSet: { available: boolean; reason: string | null; renames: number };
        scannedFiles: number;
      };
      written?: { written: Array<{ file: string; applied: number }>; skipped: unknown[] };
    },
  };
}

/**
 * A repo that has just done the rename, with the same four forms the field
 * sample carried: the alias, a relative literal, a path with no `src/` prefix,
 * and a comment — the last one in a `.css` file.
 */
function seedRenamedRepo(): string {
  // realpath: on macOS os.tmpdir() is /var/... behind a symlink to /private/var,
  // so an unresolved root makes `--root` and `git rev-parse --show-toplevel`
  // disagree and the monorepo-rebase path is never the one under test.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-path-drift-')));
  const oldDir = path.join(root, 'src/components/features/projects/process-management');
  fs.mkdirSync(oldDir, { recursive: true });
  fs.mkdirSync(path.join(root, 'src/app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'ark.config.json'), JSON.stringify({ include: ['src'], layers: [], rules: [] }));
  fs.writeFileSync(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@/*': ['src/*'] } } })
  );
  fs.writeFileSync(path.join(oldDir, 'catalogue-edit-button.tsx'), 'export const CatalogueEditButton = 1;\n');
  fs.writeFileSync(
    path.join(oldDir, 'panel.tsx'),
    'const mod = "./catalogue-edit-button";\nexport default mod;\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/app/page.tsx'),
    'import { X } from "@/components/features/projects/process-management/catalogue-edit-button"\n' +
      'const probe = "components/features/projects/process-management/catalogue-edit-button.tsx"\n' +
      'export default [X, probe]\n'
  );
  fs.writeFileSync(
    path.join(root, 'src/app/globals.css'),
    '/* Paired with components/features/projects/process-management/catalogue-edit-button. */\n.a { color: red }\n'
  );
  git(root, ['init', '-q', '-b', 'main', '.']);
  git(root, ['config', 'user.email', 'harness@example.test']);
  git(root, ['config', 'user.name', 'harness']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-qm', 'base']);
  fs.mkdirSync(path.join(root, 'src/components/catalogue'), { recursive: true });
  git(root, [
    'mv',
    'src/components/features/projects/process-management/catalogue-edit-button.tsx',
    'src/components/catalogue/catalogue-edit-button.tsx',
  ]);
  return root;
}

describe('ark-check --path-drift', () => {
  it('finds all four forms against the rename set, previews by default, and exits 1', () => {
    const root = seedRenamedRepo();
    try {
      const { status, payload } = runDriftJson(root, ['--base-ref', 'HEAD']);
      expect(payload.pathDrift.renameSet.available).toBe(true);
      expect(payload.pathDrift.renameSet.renames).toBe(1);

      const forms = payload.pathDrift.anchored.map((f) => `${f.form}:${path.posix.basename(f.file)}`).sort();
      expect(forms).toEqual([
        'alias:page.tsx',
        'prose:globals.css',
        'relative:panel.tsx',
        'rootless:page.tsx',
      ]);
      for (const finding of payload.pathDrift.anchored) {
        expect(finding.ruleId).toBe('LITERAL_PATH_DRIFT');
        expect(finding.suggestedToken).toContain('catalogue/catalogue-edit-button');
      }
      // Plan by default: nothing on disk changed.
      expect(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')).toContain(
        'process-management'
      );
      expect(status).toBe(1);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--write applies the anchored replacements and the re-run is green', () => {
    const root = seedRenamedRepo();
    try {
      const first = runDriftJson(root, ['--base-ref', 'HEAD', '--write']);
      expect(first.status).toBe(0);
      expect(first.payload.written?.written.length).toBe(3);
      expect(fs.readFileSync(path.join(root, 'src/app/page.tsx'), 'utf8')).toContain(
        '"@/components/catalogue/catalogue-edit-button"'
      );
      expect(fs.readFileSync(path.join(root, 'src/app/globals.css'), 'utf8')).toContain(
        'components/catalogue/catalogue-edit-button.'
      );

      const second = runDriftJson(root, ['--base-ref', 'HEAD']);
      expect(second.payload.pathDrift.anchored).toEqual([]);
      expect(second.status).toBe(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('says so instead of printing a green when there is no rename set to anchor against', () => {
    const root = seedRenamedRepo();
    try {
      const run = runDrift(root);
      expect(run.stdout).toContain('No rename set');
      expect(run.stdout).toContain('anchored mode is OFF');
      // Exit 2, not 0: a pipeline reads the status, and a run that could not
      // check anything must not be indistinguishable from a clean one.
      expect(run.status).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps the unanchored sweep out of the default output but never hides its count', () => {
    const root = seedRenamedRepo();
    try {
      fs.writeFileSync(
        path.join(root, 'src/app/note.ts'),
        '// moved out of src/components/gone-forever/thing.ts\nexport const n = 1;\n'
      );
      const quiet = runDriftJson(root, ['--base-ref', 'HEAD']);
      expect(quiet.payload.pathDrift.unanchoredCount).toBe(1);
      expect(quiet.payload.pathDrift.unanchored).toEqual([]);
      expect(quiet.payload.pathDrift.unanchoredListed).toBe(false);

      const loud = runDriftJson(root, ['--base-ref', 'HEAD', '--all']);
      expect(loud.payload.pathDrift.unanchoredListed).toBe(true);
      expect(loud.payload.pathDrift.unanchored).toHaveLength(1);
      expect(loud.payload.pathDrift.unanchored[0]!.ruleId).toBe('LITERAL_PATH_UNRESOLVED');

      // Advisory: an unanchored candidate never moves the exit code and is
      // never written.
      const written = runDriftJson(root, ['--base-ref', 'HEAD', '--write']);
      expect(written.status).toBe(0);
      expect(fs.readFileSync(path.join(root, 'src/app/note.ts'), 'utf8')).toContain(
        'src/components/gone-forever/thing.ts'
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to print a green tick when anchored mode never ran', () => {
    const root = seedRenamedRepo();
    try {
      const run = runDrift(root);
      // The one false green this pass exists to remove: a tick over a check
      // that had nothing to check against.
      expect(run.stdout).not.toContain('\u2714');
      expect(run.stdout).toContain('Anchored mode did not run');
      expect(run.stdout).toContain('says nothing about drift');
      expect(run.status).toBe(2);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--write refuses a symlinked file and leaves the link target alone', () => {
    const root = seedRenamedRepo();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-drift-outside-')));
    try {
      const victim = path.join(outside, 'victim.ts');
      const victimSource =
        'const p = "@/components/features/projects/process-management/catalogue-edit-button";\n';
      fs.writeFileSync(victim, victimSource);
      fs.symlinkSync(victim, path.join(root, 'src/app/linked.ts'));

      const run = runDriftJson(root, ['--base-ref', 'HEAD', '--write']);
      // The link is never scanned, so it is never written — and the file it
      // points at, outside the root, is byte-identical.
      expect(fs.readFileSync(victim, 'utf8')).toBe(victimSource);
      expect(run.payload.written?.written.some((w) => w.file.includes('linked'))).toBeFalsy();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('a hostile --base-ref never reaches git', () => {
    const root = seedRenamedRepo();
    const marker = path.join(root, 'pwned');
    try {
      // Two layers, and this pins both. The flag parser refuses a value that
      // starts with '-' outright...
      const flagShaped = runDrift(root, ['--base-ref', `--upload-pack=touch ${marker}`]);
      expect(flagShaped.status).not.toBe(0);
      expect(flagShaped.stderr).toContain('Missing value for --base-ref');

      // ...and safeRef refuses everything that is not ref-shaped, so a value
      // that gets past the parser still never becomes a git argument.
      for (const hostile of ['a;touch x', 'a b', 'ref..other', 'a{b}', 'a:b']) {
        const run = runDriftJson(root, ['--base-ref', hostile]);
        expect(run.payload.pathDrift.renameSet.available, hostile).toBe(false);
        expect(run.payload.pathDrift.renameSet.reason, hostile).toBe('no-base-ref');
      }
      expect(fs.existsSync(marker)).toBe(false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('--write refuses a hard link and a file that is not valid UTF-8', () => {
    const root = seedRenamedRepo();
    const outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ark-drift-hard-')));
    try {
      const drifted =
        'const p = "@/components/features/projects/process-management/catalogue-edit-button";\n';
      const victim = path.join(outside, 'victim.ts');
      fs.writeFileSync(victim, drifted);
      fs.linkSync(victim, path.join(root, 'src/app/hard.ts'));

      // A latin-1 byte anywhere in the file: reading it as utf8 and writing the
      // whole string back would replace it with U+FFFD.
      const binary = Buffer.concat([Buffer.from(drifted, 'utf8'), Buffer.from([0xff])]);
      fs.writeFileSync(path.join(root, 'src/app/binary.ts'), binary);

      const run = runDriftJson(root, ['--base-ref', 'HEAD', '--write']);
      const reasons = (run.payload.written?.skipped ?? []) as Array<{ file: string; reason: string }>;
      expect(reasons.find((r) => r.file.endsWith('hard.ts'))?.reason).toBe('hard-link');
      expect(reasons.find((r) => r.file.endsWith('binary.ts'))?.reason).toBe('not-utf8');
      expect(fs.readFileSync(victim, 'utf8')).toBe(drifted);
      expect(fs.readFileSync(path.join(root, 'src/app/binary.ts'))).toEqual(binary);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(outside, { recursive: true, force: true });
    }
  });

  it('after --write the report describes the tree as it now stands', () => {
    const root = seedRenamedRepo();
    try {
      const run = runDrift(root, ['--base-ref', 'HEAD', '--write']);
      // No red findings re-listed above the lines saying they were just fixed.
      expect(run.stdout).not.toContain('\u2716 LITERAL_PATH_DRIFT');
      expect(run.stdout).toContain('No anchored literal path drift.');
      expect(run.stdout).toContain('wrote src/app/page.tsx');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('reads a broken contract as no reason to hide drift', () => {
    const root = seedRenamedRepo();
    try {
      fs.writeFileSync(path.join(root, 'ark.config.json'), '{ not json');
      const run = runDriftJson(root, ['--base-ref', 'HEAD']);
      expect(run.payload.pathDrift.anchored.length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
