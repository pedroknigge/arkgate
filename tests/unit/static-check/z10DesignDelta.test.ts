import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

import {
  evaluateGitDesignDelta,
  evaluateWriteDesignDelta,
} from '../../../bin/lib/design-delta.mjs';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');

function fixtureEnv(): NodeJS.ProcessEnv {
  return { ...process.env, ARK_POLICY_BASE_REF: '', GITHUB_BASE_REF: '' };
}

const config = {
  schemaVersion: '1.0',
  include: ['apps', 'packages'],
  layers: [
    { name: 'DomainModel', patterns: ['packages/shared/src/rules/**'] },
    { name: 'PresentationAdapters', patterns: ['apps/web/src/product/**'] },
  ],
  rules: [
    { from: 'DomainModel', to: 'PresentationAdapters', allowed: false },
  ],
};

function write(root: string, relativePath: string, content: string) {
  const absolutePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, content);
}

function git(root: string, args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr || result.stdout).toBe(0);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z10-design-delta-'));
  write(root, 'package.json', '{"name":"propia-shaped-fixture","private":true}\n');
  write(root, 'ark.config.json', `${JSON.stringify(config, null, 2)}\n`);
  write(root, 'AGENTS.md', '# ArkGate Enforcement\n');
  write(root, '.mcp.json', '{"mcpServers":{"ark":{"command":"arkgate-mcp"}}}\n');
  write(root, '.github/workflows/ark-check.yml', 'jobs:\n  ark-check:\n    steps:\n      - run: npx ark-check --strict-merge\n');
  write(
    root,
    'apps/web/src/product/legacy-policy.ts',
    'export function canDeleteListing(listing: { ownerId: string }, userId: string) {\n' +
      '  return listing.ownerId === userId;\n' +
      '}\n'
  );
  write(root, 'apps/web/src/product/page.tsx', 'export const Page = () => <main>Listings</main>;\n');
  write(root, 'packages/shared/src/rules/listing.ts', 'export const listingKind = "listing";\n');
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'arkgate@example.invalid']);
  git(root, ['config', 'user.name', 'ArkGate Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'base']);
  return root;
}

function doctor(root: string, baseRef = 'HEAD') {
  const result = spawnSync(
    process.execPath,
    [
      ARK_CHECK,
      '--root', root,
      '--config', 'ark.config.json',
      '--doctor',
      '--fail-on-new-smells',
      '--base-ref', baseRef,
      '--json',
      '--no-cache',
    ],
    { cwd: root, encoding: 'utf8', env: fixtureEnv() }
  );
  return { result, json: JSON.parse(result.stdout) };
}

describe('Z10 base-relative design delta', () => {
  it('blocks a new Propia-shaped authorization helper while retaining stable identity evidence', () => {
    const root = fixture();
    write(
      root,
      'apps/web/src/product/listing-permissions.ts',
      'export function canManageListing(\n' +
        '  listing: { ownerId: string },\n' +
      '  actor: { id: string; role: string },\n' +
      ') {\n' +
      '  return listing.ownerId === actor.id || actor.role === "admin";\n' +
      '}\n' +
      'export const calculateListingFee = (price: number) => price * 0.03;\n' +
      'export const listingPolicy = (role: string) => role === "admin";\n'
    );

    const { result, json } = doctor(root);
    expect(result.status, result.stderr || result.stdout).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.doctor.designDelta).toMatchObject({
      schemaVersion: '1.0',
      mode: 'git-base',
      complete: true,
      valid: false,
      supportedSmellIds: ['domain-logic-in-ui'],
    });
    expect(json.doctor.designDelta.changes).toHaveLength(3);
    expect(json.doctor.designDelta.changes.map((change: any) => change.evidence.symbol).sort()).toEqual([
      'calculateListingFee',
      'canManageListing',
      'listingPolicy',
    ]);
    for (const change of json.doctor.designDelta.changes) {
      expect(change).toEqual(expect.objectContaining({
        smellId: 'domain-logic-in-ui',
        classification: 'new',
        fingerprint: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
        evidence: expect.objectContaining({ path: 'apps/web/src/product/listing-permissions.ts' }),
      }));
    }
  });

  it('keeps pre-existing residual and an unrelated or presentation-only change green', () => {
    const root = fixture();
    write(root, 'apps/web/src/product/page.tsx', 'export const Page = () => <main>Homes</main>;\n');
    write(
      root,
      'apps/web/src/product/navigation.ts',
      'export const canNavigateRoute = (route: { label: string }, current: { label: string }) =>\n' +
        '  route.label === current.label;\n' +
        'export const calculateLabelWidth = (label: string) => label.length * 8;\n' +
        'export const shouldShowMenu = (expanded: boolean) => expanded === true;\n'
    );

    const { result, json } = doctor(root);
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(json.doctor.designDelta).toMatchObject({
      complete: true,
      valid: true,
      baseFindingCount: 1,
      candidateFindingCount: 1,
      historicalResidualCount: 1,
      changes: [],
    });
  });

  it('classifies a stronger rule in the same helper as worsened', () => {
    const root = fixture();
    write(
      root,
      'apps/web/src/product/legacy-policy.ts',
      'export function canDeleteListing(\n' +
        '  listing: { ownerId: string },\n' +
        '  actor: { id: string; role: string },\n' +
        ') {\n' +
        '  return listing.ownerId === actor.id || actor.role === "admin";\n' +
        '}\n'
    );

    const delta = evaluateGitDesignDelta({
      root,
      config,
      configPath: 'ark.config.json',
      baseRef: 'HEAD',
      ts,
    });
    expect(delta.valid).toBe(false);
    expect(delta.changes).toEqual([
      expect.objectContaining({
        classification: 'worsened',
        baseMagnitude: 1,
        candidateMagnitude: 3,
        evidence: expect.objectContaining({ symbol: 'canDeleteListing' }),
      }),
    ]);
  });

  it('does not turn a path-only move of historical residual into new debt', () => {
    const root = fixture();
    fs.renameSync(
      path.join(root, 'apps/web/src/product/legacy-policy.ts'),
      path.join(root, 'apps/web/src/product/legacy-permissions.ts')
    );
    const delta = evaluateGitDesignDelta({
      root,
      config,
      configPath: path.join(root, 'ark.config.json'),
      baseRef: 'HEAD',
      ts,
    });
    expect(delta).toMatchObject({
      complete: true,
      valid: true,
      changes: [],
      historicalResidualCount: 1,
    });
  });

  it('fails closed when the requested base is missing or unresolvable', () => {
    const root = fixture();
    const missing = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--doctor', '--fail-on-new-smells', '--json', '--no-cache'],
      { cwd: root, encoding: 'utf8', env: fixtureEnv() }
    );
    expect(missing.status).toBe(2);
    expect(JSON.parse(missing.stdout).doctor.designDelta).toMatchObject({
      complete: false,
      valid: false,
      error: expect.stringContaining('--base-ref'),
    });

    const missingMerge = spawnSync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--strict-merge', '--fail-on-new-smells', '--json', '--no-cache'],
      { cwd: root, encoding: 'utf8', env: fixtureEnv() }
    );
    expect(missingMerge.status).toBe(2);
    expect(JSON.parse(missingMerge.stdout).designDelta).toMatchObject({
      complete: false,
      valid: false,
    });

    const unresolved = doctor(root, 'refs/heads/does-not-exist');
    expect(unresolved.result.status).toBe(2);
    expect(unresolved.json.doctor.designDelta).toMatchObject({ complete: false, valid: false });
  });

  it('uses the same smell fingerprint and verdict for an in-memory write candidate', () => {
    const root = fixture();
    write(
      root,
      '.ark/golden-pattern.json',
      JSON.stringify({ name: 'shared-rules', norm: 'pure rules outside UI', newCodeHome: 'packages/shared/src/rules/' })
    );
    const delta = evaluateWriteDesignDelta({
      root,
      config,
      ts,
      changes: [
        {
          path: 'apps/web/src/product/listing-permissions.ts',
          content:
            'export const canManageListing = (ownerId: string, actorId: string) => ' +
            'ownerId === actorId;\n',
        },
      ],
    });
    expect(delta).toMatchObject({ mode: 'write-candidate', complete: true, valid: false });
    expect(delta.changes[0]).toMatchObject({
      smellId: 'domain-logic-in-ui',
      classification: 'new',
      evidence: expect.objectContaining({ symbol: 'canManageListing' }),
      repairHint: expect.stringContaining('packages/shared/src/rules/'),
    });
    const schema = JSON.parse(
      fs.readFileSync(path.resolve('schemas/ark.design-delta.schema.json'), 'utf8')
    );
    const validate = new Ajv2020({ strict: false }).compile(schema);
    expect(validate(delta), JSON.stringify(validate.errors)).toBe(true);
    const manifest = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
    expect(manifest.exports['./schema/design-delta']).toBe(
      './schemas/ark.design-delta.schema.json'
    );
  });
});
