import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(REPO, 'scripts/check-legacy-identity.mjs');

function fixture(files: Record<string, string>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-identity-ratchet-'));
  for (const [relativePath, content] of Object.entries(files)) {
    const file = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

function run(root: string) {
  return spawnSync(process.execPath, [SCRIPT, '--root', root], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

describe('legacy public identity ratchet', () => {
  it('accepts canonical Structrail-only surfaces', () => {
    const result = run(fixture({ 'README.md': '# Structrail\nUse `structrail-check`.\n' }));
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects an unmarked legacy public name with file and line evidence', () => {
    const result = run(fixture({ 'README.md': '# ArkGate\n' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('README.md:1');
    expect(result.stderr).toContain('ArkGate');
  });

  it('rejects an unapproved legacy public filename', () => {
    const result = run(fixture({ 'docs/ark-guide.md': '# Structrail\n' }));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('docs/ark-guide.md:path');
  });

  it('allows v3 compatibility only when its removal target is v4', () => {
    const accepted = run(
      fixture({
        'README.md': [
          '<!-- legacy-identity:start v3-compatibility removal=v4 -->',
          'The `arkgate` package remains supported.',
          '<!-- legacy-identity:end -->',
          '',
        ].join('\n'),
      })
    );
    expect(accepted.status, accepted.stderr).toBe(0);

    const rejected = run(
      fixture({
        'README.md': [
          '<!-- legacy-identity:start v3-compatibility removal=v3.9 -->',
          'The `arkgate` package remains supported.',
          '<!-- legacy-identity:end -->',
          '',
        ].join('\n'),
      })
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('removal target must be v4');
  });

  it('allows M6-gated external references without pretending they are v4 aliases', () => {
    const result = run(
      fixture({
        'README.md': [
          '<!-- legacy-identity:start external-cutover -->',
          'https://github.com/pedroknigge/arkgate',
          '<!-- legacy-identity:end -->',
          '',
        ].join('\n'),
      })
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it('rejects unbalanced approval markers', () => {
    const result = run(
      fixture({
        'README.md': '<!-- legacy-identity:start v3-compatibility removal=v4 -->\nArkGate\n',
      })
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('unclosed legacy-identity block');
  });

  it('accepts deprecated TypeScript aliases only with the v4 target', () => {
    const accepted = run(
      fixture({
        'src/index.ts': [
          '/** @deprecated Use StructrailKernel. Removal target: v4. */',
          'export type ArkKernel = StructrailKernel;',
          '',
        ].join('\n'),
      })
    );
    expect(accepted.status, accepted.stderr).toBe(0);

    const rejected = run(
      fixture({
        'src/index.ts': [
          '/** @deprecated Use StructrailKernel. Removal target: v3.9. */',
          'export type ArkKernel = StructrailKernel;',
          '',
        ].join('\n'),
      })
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toContain('src/index.ts:2');
  });

  it('does not let a detached deprecation comment approve later legacy text', () => {
    const result = run(
      fixture({
        'src/index.ts': [
          '/** @deprecated Use StructrailKernel. Removal target: v4. */',
          '',
          '',
          '',
          'export const ArkGateName = "legacy";',
          '',
        ].join('\n'),
      })
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('src/index.ts:5');
  });

  it('ignores generated mutation reports when scanning an exported tree without git metadata', () => {
    const result = run(
      fixture({
        'README.md': '# Structrail\n',
        'reports/mutation/mutation.json': '{"mutant":"arkgate"}\n',
      })
    );
    expect(result.status, result.stderr).toBe(0);
  });

  it('passes against the repository public surface', () => {
    const result = run(REPO);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toMatch(/legacy identity ratchet passed/i);
  });
});

describe('legacy identity gate wiring', () => {
  it('runs in package scripts, CI, and every npm release path', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const ci = fs.readFileSync(path.join(REPO, '.github/workflows/ci.yml'), 'utf8');
    const release = fs.readFileSync(path.join(REPO, 'scripts/release-npm.mjs'), 'utf8');
    const publishWorkflow = fs.readFileSync(
      path.join(REPO, '.github/workflows/publish-npm.yml'),
      'utf8'
    );

    expect(pkg.scripts['check:identity']).toBe('node scripts/check-legacy-identity.mjs');
    expect(ci).toContain('run: npm run check:identity');
    const identityGate = release.indexOf("run('npm run check:identity')");
    const publishCommand = release.indexOf("'npm publish --dry-run'");
    expect(identityGate).toBeGreaterThanOrEqual(0);
    expect(publishCommand).toBeGreaterThan(identityGate);
    expect(publishWorkflow).toContain('npm run check:identity');
  });
});
