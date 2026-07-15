import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function read(path: string): string {
  return fs.readFileSync(path, 'utf8');
}

describe('confidence gate wiring', () => {
  it('defines one executable coverage + mutation command', () => {
    const pkg = JSON.parse(read('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(pkg.scripts['test:coverage']).toBe(
      'npm run build && vitest run --coverage --coverage.reporter=text-summary --coverage.reporter=json-summary'
    );
    expect(pkg.scripts['test:mutation']).toBe(
      'npm run build && stryker run && npm run check:mutation-groups'
    );
    expect(pkg.scripts['check:mutation-groups']).toBe('node scripts/check-mutation-groups.mjs');
    expect(pkg.scripts['test:confidence']).toBe(
      'npm run test:coverage && npm run test:mutation'
    );
  });

  it('uses the same confidence gate in CI and before every npm publish path', () => {
    const ci = read('.github/workflows/ci.yml');
    const releaseScript = read('scripts/release-npm.mjs');
    const publishWorkflow = read('.github/workflows/publish-npm.yml');

    expect(ci).toContain('run: npm run test:confidence');

    const localConfidence = releaseScript.indexOf("run('npm run test:confidence')");
    const localPublish = releaseScript.indexOf("'npm publish --dry-run'");
    expect(localConfidence).toBeGreaterThanOrEqual(0);
    expect(localPublish).toBeGreaterThan(localConfidence);

    const tokenBranch = publishWorkflow.slice(
      publishWorkflow.indexOf('# Still run full verify suite')
    );
    const tokenConfidence = tokenBranch.indexOf('npm run test:confidence');
    const tokenPublish = tokenBranch.indexOf('npm publish --access public --provenance');
    expect(tokenConfidence).toBeGreaterThanOrEqual(0);
    expect(tokenPublish).toBeGreaterThan(tokenConfidence);
    expect(publishWorkflow).toContain('npm run release:npm');
  });

  it('can resume checksum and release assets after npm already published the tag', () => {
    const workflow = read('.github/workflows/publish-npm.yml');
    expect(workflow).toContain('id: npm-state');
    expect(workflow).toContain('published_git_head="$(npm view "$package@$version" gitHead');
    expect(workflow).toContain('tag_commit="$(git rev-list -n 1 "$RELEASE_TAG")"');
    expect(workflow).toContain("steps.npm-state.outputs.published != 'true'");

    const checksum = workflow.indexOf('- name: Upload npm tarball checksum');
    const assets = workflow.indexOf('- name: Attach release artifacts');
    expect(checksum).toBeGreaterThan(workflow.indexOf('- name: Publish to npm'));
    expect(assets).toBeGreaterThan(checksum);
    expect(workflow.slice(checksum, assets)).not.toContain('npm-state.outputs.published');
    expect(workflow.slice(assets)).not.toContain('npm-state.outputs.published');
  });
});
