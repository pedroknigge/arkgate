/**
 * LPD — literal path drift detector (pure Domain).
 *
 * The cases are the four forms and the four traps from the field sample
 * (`.orderfield/work/evidence/literal-path-drift-data.md`): 783 renames, 49
 * vanished source directories, and a class of defect nothing in the gate sees.
 */
import { describe, expect, it } from 'vitest';
import {
  LITERAL_PATH_DRIFT_RULE_ID,
  LITERAL_PATH_SCAN_EXTENSIONS,
  LITERAL_PATH_UNRESOLVED_RULE_ID,
  applyLiteralPathDrift,
  extractPathLiterals,
  findLiteralPathDrift,
  isGeneratedLiteralPathFile,
  isLiteralPathScannable,
  resolutionCandidates,
} from '../../../src/domain/literalPathDrift';

const ROOTS = ['src', 'components', 'lib', 'hooks', 'app', 'tests'];
const PREFIXES = ['src'];

/** Tree after the rename: the old catalogue/timesheet locations are gone. */
const FILES = [
  'src/components/catalogue/catalogue-edit-button.tsx',
  'src/components/features/projects/bid-analysis/comparison-table.tsx',
  'src/lib/features/projects/requisitions/package-plan.ts',
  'src/lib/features/management/team-pivot/index.ts',
  'src/test/lib/quick-contract-validate.test.ts',
  'src/app/globals.css',
  'src/hooks/use-thing.ts',
];

/**
 * `exists` answers for directories too — that is what the filesystem gives the
 * CLI side, and a surviving directory is what stops a single file moving into a
 * subfolder from being read as its whole directory having moved.
 */
const TREE = new Set<string>(FILES);
for (const file of FILES) {
  const parts = file.split('/');
  for (let i = 1; i < parts.length; i += 1) TREE.add(parts.slice(0, i).join('/'));
}
const exists = (relPath: string) => TREE.has(relPath);

const RENAMES = [
  {
    from: 'src/components/features/projects/process-management/catalogue-edit-button.tsx',
    to: 'src/components/catalogue/catalogue-edit-button.tsx',
  },
  {
    from: 'src/components/bid-analysis/comparison-table.tsx',
    to: 'src/components/features/projects/bid-analysis/comparison-table.tsx',
  },
  {
    from: 'src/lib/requisitions/package-plan.ts',
    to: 'src/lib/features/projects/requisitions/package-plan.ts',
  },
  {
    from: 'src/lib/timesheet/team-pivot/index.ts',
    to: 'src/lib/features/management/team-pivot/index.ts',
  },
];

function run(files: { path: string; text: string }[]) {
  return findLiteralPathDrift({ files, exists, renames: RENAMES, roots: ROOTS, rootlessPrefixes: PREFIXES });
}

describe('literalPathDrift — the four forms', () => {
  it('A · alias literal: reports the drift and rewrites in the alias form', () => {
    const report = run([
      {
        path: 'src/app/page.tsx',
        text: 'import { X } from "@/components/features/projects/process-management/catalogue-edit-button"\n',
      },
    ]);
    expect(report.unanchored).toEqual([]);
    expect(report.anchored).toHaveLength(1);
    const finding = report.anchored[0]!;
    expect(finding.ruleId).toBe(LITERAL_PATH_DRIFT_RULE_ID);
    expect(finding.form).toBe('alias');
    expect(finding.line).toBe(1);
    expect(finding.suggestedToken).toBe('@/components/catalogue/catalogue-edit-button');
    expect(finding.message).toContain('does not resolve');
  });

  it('B · relative literal: rewrites relative to the referencing file', () => {
    const report = run([
      {
        path: 'src/components/features/projects/process-management/panel.tsx',
        text: 'const mod = await import("./catalogue-edit-button");\n',
      },
    ]);
    expect(report.anchored).toHaveLength(1);
    expect(report.anchored[0]!.form).toBe('relative');
    expect(report.anchored[0]!.suggestedToken).toBe('../../../catalogue/catalogue-edit-button');
  });

  it('C · no src/ prefix: a path concatenated from the repo root', () => {
    const report = run([
      {
        path: 'tests/unit/shape.test.ts',
        text: '    const src = read("components/bid-analysis/comparison-table.tsx")\n',
      },
    ]);
    expect(report.anchored).toHaveLength(1);
    const finding = report.anchored[0]!;
    expect(finding.form).toBe('rootless');
    // The author's own coordinate space is preserved: still no src/ prefix.
    expect(finding.suggestedToken).toBe(
      'components/features/projects/bid-analysis/comparison-table.tsx'
    );
  });

  it('D · comments and docstrings — including a .css file', () => {
    const report = run([
      {
        path: 'src/domain/requisition.ts',
        text: '/**\n * NULL = project defaults. See `lib/requisitions/package-plan.ts`.\n */\nexport const x = 1;\n',
      },
      {
        path: 'src/app/globals.css',
        text: '/* Paired with lib/timesheet/team-pivot for the cube payload. */\n.a { color: red }\n',
      },
    ]);
    expect(report.anchored).toHaveLength(2);
    expect(report.anchored.every((f) => f.form === 'prose')).toBe(true);
    expect(report.anchored[0]!.line).toBe(2);
    expect(report.anchored[0]!.suggestedToken).toBe(
      'lib/features/projects/requisitions/package-plan.ts'
    );
    expect(report.anchored[1]!.file).toBe('src/app/globals.css');
  });

  it('scans .css and .md, not only TS/TSX', () => {
    expect(LITERAL_PATH_SCAN_EXTENSIONS).toContain('.css');
    expect(LITERAL_PATH_SCAN_EXTENSIONS).toContain('.md');
    expect(isLiteralPathScannable('docs/runbook.md')).toBe(true);
    expect(isLiteralPathScannable('src/app/globals.css')).toBe(true);
    expect(isLiteralPathScannable('image.png')).toBe(false);
  });
});

describe('literalPathDrift — the four traps', () => {
  it('1 · a substring match is not drift when the full token resolves', () => {
    // `lib/quick-contract` matches inside a file that exists; only the full
    // extracted token counts, and only when it does not resolve.
    const report = run([
      {
        path: 'src/domain/note.ts',
        text: '// see src/test/lib/quick-contract-validate.test.ts for the shape\n',
      },
    ]);
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toEqual([]);
    expect(report.candidates).toBe(1);
  });

  it('2 · an extensionless reference resolves through index and source extensions', () => {
    expect(resolutionCandidates('src/hooks/use-thing')).toContain('src/hooks/use-thing.ts');
    expect(resolutionCandidates('src/lib/features/management/team-pivot')).toContain(
      'src/lib/features/management/team-pivot/index.ts'
    );
    const report = run([
      { path: 'src/app/page.tsx', text: 'const p = "src/hooks/use-thing";\n' },
      {
        path: 'src/app/other.tsx',
        text: '// lives in lib/features/management/team-pivot now\n',
      },
    ]);
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toEqual([]);
  });

  it('3 · prose punctuation is trimmed off the token', () => {
    const [candidate] = extractPathLiterals(
      'src/a.ts',
      '// see components/catalogue/payapp-readiness-stepper.tsx.\n',
      { roots: ROOTS }
    );
    expect(candidate?.token).toBe('components/catalogue/payapp-readiness-stepper.tsx');
  });

  it('4 · generated files are noise and are never scanned', () => {
    expect(isGeneratedLiteralPathFile('src/component-inventory.generated.ts')).toBe(true);
    expect(isGeneratedLiteralPathFile('src/generated/api.ts')).toBe(true);
    expect(isGeneratedLiteralPathFile('src/domain/real.ts')).toBe(false);
    const report = run([
      {
        path: 'src/component-inventory.generated.ts',
        text: 'export const all = ["lib/requisitions/package-plan.ts"];\n',
      },
    ]);
    expect(report.scannedFiles).toBe(0);
    expect(report.anchored).toEqual([]);
  });
});

describe('literalPathDrift — the two modes make different claims', () => {
  it('unanchored drift is advisory and proposes nothing', () => {
    const report = run([
      { path: 'src/app/page.tsx', text: '// moved out of src/lib/gone-forever/thing.ts\n' },
    ]);
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toHaveLength(1);
    const finding = report.unanchored[0]!;
    expect(finding.ruleId).toBe(LITERAL_PATH_UNRESOLVED_RULE_ID);
    expect(finding.suggestedToken).toBeNull();
    expect(finding.suggestedTarget).toBeNull();
    expect(finding.message).toContain('no destination to propose');
  });

  it('an ambiguous rename source anchors nothing and is reported as such', () => {
    const report = findLiteralPathDrift({
      files: [{ path: 'src/a.ts', text: '// see lib/split/thing.ts\n' }],
      exists,
      roots: ROOTS,
      rootlessPrefixes: PREFIXES,
      renames: [
        { from: 'src/lib/split/thing.ts', to: 'src/lib/one/thing.ts' },
        { from: 'src/lib/split/thing.ts', to: 'src/lib/two/thing.ts' },
      ],
    });
    expect(report.ambiguousAnchors).toContain('src/lib/split/thing.ts');
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toHaveLength(1);
  });

  it('a rename whose source still exists never anchors', () => {
    const report = findLiteralPathDrift({
      files: [{ path: 'src/a.ts', text: '// see src/hooks/use-thing.ts\n' }],
      exists,
      roots: ROOTS,
      rootlessPrefixes: PREFIXES,
      renames: [{ from: 'src/hooks/use-thing.ts', to: 'src/hooks/moved/use-thing.ts' }],
    });
    expect(report.anchorsConsidered).toBe(0);
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toEqual([]);
  });

  it('a token written in code context is not a literal', () => {
    const report = run([
      { path: 'src/a.ts', text: 'const x = lib/requisitions/package_plan;\n' },
    ]);
    expect(report.candidates).toBe(0);
  });
});

describe('literalPathDrift — what may never be proposed or written', () => {
  it('a destination that is not path-shaped is never proposed', () => {
    // git paths are raw bytes: a quote or a newline in a rename destination
    // would be spliced straight into a source line by --write.
    const hostile = 'src/lib/x";globalThis.pwned=1;"';
    const report = findLiteralPathDrift({
      files: [{ path: 'src/a.ts', text: 'const p = "src/lib/gone/thing.ts";\n' }],
      exists: (p) => p === hostile || exists(p),
      roots: ROOTS,
      rootlessPrefixes: PREFIXES,
      renames: [{ from: 'src/lib/gone/thing.ts', to: hostile }],
    });
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toHaveLength(1);
    expect(report.unanchored[0]!.suggestedToken).toBeNull();
  });

  it('a replacement that is no longer a path is never proposed', () => {
    // `./c` whose destination is the file's own directory renders as the bare
    // `./`. Charset-legal, and it turns require("./c") into require("./") — a
    // different module, not a repaired reference.
    const report = findLiteralPathDrift({
      files: [{ path: 'src/a/b.ts', text: 'const mod = require("./c");\n' }],
      exists: (p) => p === 'src/a' || p === 'src/a/b.ts' || p === 'src',
      roots: ROOTS,
      rootlessPrefixes: PREFIXES,
      renames: [{ from: 'src/a/c', to: 'src/a' }],
    });
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toHaveLength(1);
  });

  it('caps the finding lists without losing the count', () => {
    const line = '// see lib/requisitions/package-plan.ts\n';
    const files = Array.from({ length: 20 }, (_, i) => ({
      path: `src/f${i}.ts`,
      text: line.repeat(400),
    }));
    const report = run(files);
    expect(report.anchoredCount).toBe(8000);
    expect(report.anchored.length).toBe(report.findingCap);
    expect(report.truncated.anchored).toBe(true);
    expect(report.truncated.unanchored).toBe(false);
  });

  it('a destination that does not itself resolve is not a fix', () => {
    const report = findLiteralPathDrift({
      files: [{ path: 'src/a.ts', text: '// see src/lib/gone/thing.ts\n' }],
      exists,
      roots: ROOTS,
      rootlessPrefixes: PREFIXES,
      renames: [{ from: 'src/lib/gone/thing.ts', to: 'src/lib/also-gone/thing.ts' }],
    });
    expect(report.anchored).toEqual([]);
    expect(report.unanchored).toHaveLength(1);
  });

  it('a scoped npm package is not a repo path; a declared alias is', () => {
    const undeclared = extractPathLiterals(
      'src/a.ts',
      'import x from "@radix-ui/react-dialog";\n',
      { roots: ROOTS }
    );
    expect(undeclared).toEqual([]);

    const declared = extractPathLiterals('src/a.ts', 'import x from "@app/thing";\n', {
      roots: ROOTS,
      aliases: { '@app/': 'src/app/' },
    });
    expect(declared).toHaveLength(1);
    expect(declared[0]!.form).toBe('alias');
    expect(declared[0]!.target).toBe('src/app/thing');
  });

  it('rejects URLs, absolute paths, home paths and vendor directories', () => {
    const candidates = extractPathLiterals(
      'src/a.ts',
      [
        '// docs at https://example.com/lib/a/b',
        '// see /etc/lib/passwd and ~/lib/a/b',
        '// bundled from node_modules/lib/a/b',
        '// but src/hooks/use-thing is ours',
      ].join('\n'),
      { roots: ROOTS }
    );
    expect(candidates.map((c) => c.token)).toEqual(['src/hooks/use-thing']);
  });

  it('a trailing hyphen is part of the path, not prose punctuation', () => {
    // Trimming '-' would match `src/old` and leave a dangling '-' behind on write.
    const [candidate] = extractPathLiterals('src/a.ts', '// see components/old-\n', {
      roots: ROOTS,
    });
    expect(candidate?.token).toBe('components/old-');
  });

  it('a template interpolation is code, not a literal', () => {
    const inside = extractPathLiterals('src/a.ts', 'const p = `${lib/requisitions/x}`;\n', {
      roots: ROOTS,
    });
    expect(inside).toEqual([]);
    const around = extractPathLiterals('src/a.ts', 'const p = `lib/requisitions/x${n}`;\n', {
      roots: ROOTS,
    });
    expect(around.map((c) => c.token)).toEqual(['lib/requisitions/x']);
  });

  it('an unterminated quote does not swallow the rest of the file', () => {
    const candidates = extractPathLiterals(
      'src/a.ts',
      'const broken = "oops\n// see lib/requisitions/package-plan.ts\n',
      { roots: ROOTS }
    );
    expect(candidates.map((c) => c.form)).toEqual(['prose']);
  });

  it('handles CRLF, an empty file and a file with no trailing newline', () => {
    expect(extractPathLiterals('src/a.ts', '', { roots: ROOTS })).toEqual([]);
    expect(extractPathLiterals('src/a.ts', '// lib/a/b', { roots: ROOTS })).toHaveLength(1);
    const crlf = '// x\r\n// see lib/requisitions/package-plan.ts\r\n';
    const [candidate] = extractPathLiterals('src/a.ts', crlf, { roots: ROOTS });
    expect(candidate?.line).toBe(2);
    expect(crlf.split('\n')[1]!.slice(candidate!.column - 1, candidate!.column - 1 + candidate!.token.length)).toBe(
      candidate!.token
    );
  });
});

describe('applyLiteralPathDrift', () => {
  it('rewrites two drifted literals on the same line, in either input order', () => {
    const text = '// see lib/requisitions/package-plan.ts and lib/timesheet/team-pivot here\n';
    const report = run([{ path: 'src/a.ts', text }]);
    expect(report.anchored).toHaveLength(2);
    const forward = applyLiteralPathDrift(text, report.anchored);
    const reversed = applyLiteralPathDrift(text, [...report.anchored].reverse());
    expect(forward.applied).toHaveLength(2);
    expect(forward.text).toBe(reversed.text);
    expect(forward.text).toBe(
      '// see lib/features/projects/requisitions/package-plan.ts and lib/features/management/team-pivot here\n'
    );
  });


  const text =
    'import { X } from "@/components/features/projects/process-management/catalogue-edit-button"\n' +
    '// and lib/requisitions/package-plan.ts\n';

  it('rewrites every anchored finding and is idempotent', () => {
    const first = run([{ path: 'src/app/page.tsx', text }]);
    expect(first.anchored).toHaveLength(2);
    const written = applyLiteralPathDrift(text, first.anchored);
    expect(written.applied).toHaveLength(2);
    expect(written.skipped).toEqual([]);
    expect(written.text).toContain('"@/components/catalogue/catalogue-edit-button"');
    expect(written.text).toContain('// and lib/features/projects/requisitions/package-plan.ts');

    const second = run([{ path: 'src/app/page.tsx', text: written.text }]);
    expect(second.anchored).toEqual([]);
    expect(second.unanchored).toEqual([]);
  });

  it('skips a finding whose line no longer holds the token', () => {
    const [finding] = run([{ path: 'src/app/page.tsx', text }]).anchored;
    const written = applyLiteralPathDrift('a different file entirely\n', [finding!]);
    expect(written.applied).toEqual([]);
    expect(written.skipped).toHaveLength(1);
    expect(written.text).toBe('a different file entirely\n');
  });

  it('never writes an unanchored finding', () => {
    const report = run([
      { path: 'src/app/page.tsx', text: '// moved out of src/lib/gone-forever/thing.ts\n' },
    ]);
    const written = applyLiteralPathDrift(
      '// moved out of src/lib/gone-forever/thing.ts\n',
      report.unanchored
    );
    expect(written.applied).toEqual([]);
    expect(written.text).toBe('// moved out of src/lib/gone-forever/thing.ts\n');
  });
});
