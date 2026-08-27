/**
 * RN17 — companion `@arkgate/runtime` publishes under `experimental`, never `latest`.
 * Field `/ark-runtime` stops on npm 404; this is the distribution path that unblocks it.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

function read(rel: string): string {
  return fs.readFileSync(rel, 'utf8');
}

describe('RN17 companion experimental publish', () => {
  it('packages/runtime is named @arkgate/runtime and pinned to the experimental dist-tag', () => {
    const pkg = JSON.parse(read('packages/runtime/package.json')) as {
      name: string;
      version: string;
      publishConfig: { access: string; tag: string };
    };
    expect(pkg.name).toBe('@arkgate/runtime');
    expect(pkg.version).toMatch(/^0\./);
    expect(pkg.publishConfig.access).toBe('public');
    expect(pkg.publishConfig.tag).toBe('experimental');
  });

  it('release-npm publishes the companion under experimental and never as latest', () => {
    const script = read('scripts/release-npm.mjs');
    expect(script).toContain("const RUNTIME_DIST_TAG = 'experimental'");
    expect(script).toContain('--runtime-only');
    expect(script).toContain('build:runtime');
    expect(script).toContain('./${path.relative(root, cwd)}');
    expect(script).toContain('packages/runtime');
    expect(script).toContain("args.push('--tag', distTag)");
    expect(script).toContain('distTag: RUNTIME_DIST_TAG');
    expect(script).toMatch(/run\('npm', args, root\)/);
    expect(script).toMatch(/publishConfig\?\.tag !== RUNTIME_DIST_TAG/);
    expect(script).toContain('@arkgate/runtime');
    expect(script).not.toMatch(/RUNTIME_DIST_TAG = 'latest'/);
    expect(script).not.toMatch(/--tag latest/);
    expect(script).toContain('execFileSync');
    expect(script).not.toMatch(/\bexecSync\b/);
  });

  it('publish-npm.yml still publishes the companion when arkgate is already on npm', () => {
    const workflow = read('.github/workflows/publish-npm.yml');
    expect(workflow).toContain('runtime_published');
    expect(workflow).toContain('steps.npm-state.outputs.runtime_published');
    expect(workflow).toMatch(/published != 'true' \|\| .+runtime_published != 'true'/);
    expect(workflow).toContain('npm run release:npm');
  });

  it('publish-runtime.yml can ship the companion without a new arkgate version', () => {
    const workflow = read('.github/workflows/publish-runtime.yml');
    expect(workflow).toContain('release:npm -- --runtime-only');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('registry-url: https://registry.npmjs.org');
    expect(workflow).toContain('dry_run');
  });
});
