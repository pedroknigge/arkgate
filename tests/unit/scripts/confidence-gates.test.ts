import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

  it('keeps mutation group line ranges on the named fail-closed functions', () => {
    const contract = JSON.parse(read('eval/mutation/critical-groups.v1.json')) as {
      groups: Array<{
        id: string;
        targets: Array<{ file: string; startLine: number; endLine: number }>;
      }>;
    };
    const slice = (file: string, startLine: number, endLine: number) =>
      read(file).split('\n').slice(startLine - 1, endLine).join('\n');
    const group = (id: string) => {
      const found = contract.groups.find((entry) => entry.id === id);
      expect(found, id).toBeTruthy();
      return found!.targets[0];
    };

    const ack = group('policy-delta-ack-match');
    expect(ack.file).toBe('src/domain/policyDelta.ts');
    expect(slice(ack.file, ack.startLine, ack.endLine)).toContain(
      'export function policyDeltaAcknowledgementMatches'
    );

    const facts = group('resolved-candidate-facts');
    expect(facts.file).toBe('bin/lib/resolved-candidate-facts.mjs');
    const factsSlice = slice(facts.file, facts.startLine, facts.endLine);
    expect(factsSlice).toContain('const canonicalRoot = fs.realpathSync(root)');
    expect(factsSlice).toContain("resolution: 'unresolved'");
    expect(factsSlice).not.toContain('if (!ts?.readConfigFile');

    const promote = group('invariant-promote-honesty');
    expect(promote.file).toBe('src/domain/invariantCoverage.ts');
    expect(slice(promote.file, promote.startLine, promote.endLine)).toContain(
      'export function canPromoteInvariant'
    );

    const stryker = read('stryker.config.mjs');
    expect(stryker).toContain(`${ack.file}:${ack.startLine}-${ack.endLine}`);
    expect(stryker).toContain(`${facts.file}:${facts.startLine}-${facts.endLine}`);
    expect(stryker).toContain(`${promote.file}:${promote.startLine}-${promote.endLine}`);
  });

  it('rejects NoCoverage even when every critical group remains above threshold', () => {
    const contract = JSON.parse(read('eval/mutation/critical-groups.v1.json')) as {
      groups: Array<{
        targets: Array<{ file: string; startLine: number }>;
      }>;
    };
    const files: Record<string, { mutants: Array<object> }> = {};
    for (const group of contract.groups) {
      for (const target of group.targets) {
        const entry = files[target.file] ??= { mutants: [] };
        entry.mutants.push({
          status: 'Killed',
          location: { start: { line: target.startLine } },
        });
      }
    }
    const target = contract.groups[0].targets[0];
    const targetMutants = files[target.file].mutants;
    for (let index = 0; index < 9; index += 1) {
      targetMutants.push({
        status: 'Killed',
        location: { start: { line: target.startLine } },
      });
    }
    targetMutants.push({
      status: 'NoCoverage',
      location: { start: { line: target.startLine } },
    });

    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-mutation-groups-'));
    const report = path.join(directory, 'mutation.json');
    try {
      fs.writeFileSync(report, JSON.stringify({ files }));
      const result = spawnSync(process.execPath, ['scripts/check-mutation-groups.mjs', report], {
        encoding: 'utf8',
      });
      expect(result.status).toBe(1);
      expect(result.stdout).toContain('NoCoverage=1');
      expect(result.stderr).toContain('with zero NoCoverage mutants');
    } finally {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it('uses the same confidence gate on full-matrix CI and before every npm publish path', () => {
    const ci = read('.github/workflows/ci.yml');
    const releaseScript = read('scripts/release-npm.mjs');
    const publishWorkflow = read('.github/workflows/publish-npm.yml');

    // Single source: ci-profile.confidence_cmd (test:confidence | test:coverage) via allowlisted case.
    expect(ci).toContain('confidence_cmd:');
    expect(ci).toContain('CONFIDENCE_CMD: ${{ needs.ci-profile.outputs.confidence_cmd }}');
    expect(ci).toContain("'npm run test:confidence') npm run test:confidence");
    expect(ci).toContain("'npm run test:coverage') npm run test:coverage");
    expect(ci).toContain('unexpected confidence_cmd from ci-profile');

    const localConfidence = releaseScript.indexOf("run('npm', ['run', 'test:confidence']");
    const localPublish = releaseScript.indexOf('publishPackage({ label:');
    expect(localConfidence).toBeGreaterThanOrEqual(0);
    expect(localPublish).toBeGreaterThan(localConfidence);
    expect(releaseScript.indexOf("run('npm', ['run', 'build:runtime']")).toBeGreaterThan(
      localConfidence
    );

    expect(publishWorkflow).toContain('npm run release:npm');
    expect(publishWorkflow).not.toMatch(/npm publish --access public --provenance/);
  });

  it('packed matrix gates fail closed unless run_packed is explicit false', () => {
    const ci = read('.github/workflows/ci.yml');
    // Three gates: ts-compat, gallery, managed-upgrade — each must require profile success
    // and treat only run_packed=false as intentional skip (not empty/unset).
    const intentionalSkip = (ci.match(/RUN_PACKED" = "false"/g) ?? []).length;
    const missingInvalid = (ci.match(/run_packed missing\/invalid/g) ?? []).length;
    const profileRequired = (ci.match(/ci-profile did not succeed/g) ?? []).length;
    expect(intentionalSkip).toBeGreaterThanOrEqual(3);
    expect(missingInvalid).toBeGreaterThanOrEqual(3);
    expect(profileRequired).toBeGreaterThanOrEqual(3);
  });

  it('every docs_only skip gate also requires hygiene skip (paired light tiers)', () => {
    const ci = read('.github/workflows/ci.yml');
    // Job/step if: conditions that skip on docs_only must also skip on hygiene so
    // lockfile / supply-chain PRs do not re-fire heavy matrices.
    const docsOnlySkipRe =
      /if:\s*needs\.ci-profile\.outputs\.docs_only\s*!=\s*'true'/g;
    const matches = [...ci.matchAll(docsOnlySkipRe)];
    expect(matches.length).toBeGreaterThanOrEqual(5);

    for (const match of matches) {
      const lineStart = ci.lastIndexOf('\n', match.index ?? 0) + 1;
      const lineEnd = ci.indexOf('\n', match.index ?? 0);
      const line = ci.slice(lineStart, lineEnd === -1 ? undefined : lineEnd);
      expect(
        line,
        `docs_only skip must also gate hygiene on same if: line:\n${line}`
      ).toMatch(/needs\.ci-profile\.outputs\.hygiene\s*!=\s*'true'/);
    }

    // Hygiene is a first-class profile output and appears in skip messaging.
    expect(ci).toMatch(/^\s+hygiene:\s*\$\{\{\s*steps\.decide\.outputs\.hygiene\s*\}\}/m);
    expect(ci).toContain('docs_only or hygiene');
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
