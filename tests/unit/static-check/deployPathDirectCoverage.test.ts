import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as deployPath from '../../../bin/lib/deploy-path.mjs';

const roots: string[] = [];

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-deploy-path-'));
  roots.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const file = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('deploy path direct coverage', () => {
  it('detects Next opt-outs and CI lint/typecheck commands', () => {
    const root = fixture();
    write(
      root,
      'package.json',
      JSON.stringify({
        dependencies: { next: '16.0.0' },
        scripts: {
          build: 'next build',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
        },
      })
    );
    write(
      root,
      'next.config.mjs',
      'export default { eslint: { ignoreDuringBuilds: true } };\n'
    );
    write(
      root,
      '.github/workflows/quality.yaml',
      'steps:\n  - run: npm run lint\n  - run: npm run typecheck\n'
    );
    write(root, '.github/workflows/ignored.txt', 'run: false\n');

    expect(deployPath.detectDeployPathQuality(root)).toMatchObject({
      engines: ['next'],
      embedsLintInBuild: false,
      embedsTypecheckInBuild: true,
      eslintIgnoreDuringBuilds: true,
      hasLintScript: true,
      hasTypecheckScript: true,
      ciRunsLint: true,
      ciRunsTypecheck: true,
      hasCiWorkflows: true,
    });
  });

  it('discovers nested package scripts and portable CI workflow locations', () => {
    const root = fixture();
    write(
      root,
      'package.json',
      JSON.stringify({
        devDependencies: { nuxt: '3.0.0' },
        scripts: { build: 'nuxt build' },
      })
    );
    write(root, 'eslint.config.cjs', 'module.exports = [];\n');
    write(
      root,
      'packages/web/package.json',
      JSON.stringify({
        dependencies: { next: '16.0.0' },
        scripts: { 'lint:ci': 'eslint src', 'check:types': 'tsc --noEmit' },
      })
    );
    write(root, 'packages/broken/package.json', '{not json');
    write(
      root,
      'azure-pipelines.yml',
      'workingDirectory: packages/web\nscript: yarn lint && yarn check:types\n'
    );

    const result = deployPath.detectDeployPathQuality(root);
    expect(result.engines).toEqual(expect.arrayContaining(['nuxt', 'next']));
    expect(result.packageLintScripts).toEqual(['packages/web']);
    expect(result).toMatchObject({
      embedsLintInBuild: true,
      embedsTypecheckInBuild: true,
      hasLintScript: true,
      hasTypecheckScript: true,
      ciRunsLint: true,
      ciRunsTypecheck: true,
      hasCiWorkflows: true,
    });
  });

  it('returns an honest empty result for a repository without deploy signals', () => {
    const root = fixture();
    write(root, 'package.json', JSON.stringify({ scripts: { build: 'node build.mjs' } }));
    fs.mkdirSync(path.join(root, '.hidden-package'));
    fs.mkdirSync(path.join(root, 'node_modules'));

    expect(deployPath.detectDeployPathQuality(root)).toEqual({
      embedsLintInBuild: false,
      embedsTypecheckInBuild: false,
      engines: [],
      hasLintScript: false,
      hasTypecheckScript: false,
      ciRunsLint: false,
      ciRunsTypecheck: false,
      eslintIgnoreDuringBuilds: false,
      hasCiWorkflows: false,
      packageLintScripts: [],
    });
  });
});
