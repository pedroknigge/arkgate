import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARK_PROJECT_IDENTITY_SCHEMA,
  createProjectId,
  createProjectIdentity,
} from '../../../src/domain/projectIdentity';

const sha256Hex = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex');

describe('MCP project identity contract', () => {
  it('derives a stable project id from canonical root and config paths only', () => {
    const first = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const afterRestartOrContractEdit = createProjectId(
      '/repo',
      '/repo/ark.config.json',
      sha256Hex
    );
    const otherProject = createProjectId('/other', '/other/ark.config.json', sha256Hex);

    expect(first).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(afterRestartOrContractEdit).toBe(first);
    expect(otherProject).not.toBe(first);
  });

  it('keeps contract and runtime evidence separate from the stable project id', () => {
    const projectId = createProjectId('/repo', '/repo/ark.config.json', sha256Hex);
    const identity = createProjectIdentity({
      projectId,
      resolvedRoot: '/repo',
      resolvedConfigPath: '/repo/ark.config.json',
      arkgateVersion: '4.2.0',
      contractHash: `sha256:${'a'.repeat(64)}`,
      contractSource: 'project',
      runtimeId: 'runtime-1',
      processStartedAt: '2026-07-30T00:00:00.000Z',
    });

    expect(identity).toEqual(
      expect.objectContaining({
        schemaVersion: '1.0',
        projectId,
        contractSource: 'project',
        runtimeId: 'runtime-1',
      })
    );
    expect(ARK_PROJECT_IDENTITY_SCHEMA.required).toContain('contractHash');
    expect(ARK_PROJECT_IDENTITY_SCHEMA.required).toContain('runtimeId');
  });

  it('fails closed when the hashing adapter does not return a SHA-256 hex digest', () => {
    expect(() => createProjectId('/repo', '/repo/ark.config.json', () => 'not-a-hash')).toThrow(
      /64 hexadecimal SHA-256/
    );
  });

  it('publishes the schema through stable package subpaths', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };

    expect(pkg.exports['./schema/project-identity']).toBe(
      './schemas/ark.project-identity.schema.json'
    );
    expect(pkg.exports['./schema/ark.project-identity.schema.json']).toBe(
      './schemas/ark.project-identity.schema.json'
    );
  });
});
