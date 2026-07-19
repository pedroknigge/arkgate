import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ARK_ENFORCEMENT_STATE_SCHEMA_VERSION } from '../../../src/gate';

describe('Z06 enforcement state contract', () => {
  it('keeps the public type surface aligned with its strict schema', () => {
    const result = spawnSync(
      path.resolve('node_modules/.bin/tsc'),
      ['-p', 'tests/fixtures/enforcement-state-contract/tsconfig.json'],
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    expect(result.status, result.stderr || result.stdout).toBe(0);

    const schema = JSON.parse(
      fs.readFileSync(path.resolve('schemas/ark.enforcement-state.schema.json'), 'utf8')
    );
    expect(schema.properties.schemaVersion.const).toBe(
      ARK_ENFORCEMENT_STATE_SCHEMA_VERSION
    );
    expect(schema.$defs.boundary.required).toEqual([
      'supported',
      'analyzed',
      'configured',
      'installed',
      'active',
      'bypassable',
      'required',
      'evidence',
    ]);
    expect(schema.$defs.boundary.properties.configured).toEqual({ type: 'boolean' });
    expect(schema.$defs.boundary.properties.installed).toEqual({ type: 'boolean' });
    expect(schema.$defs.boundary.properties.required).toEqual({
      $ref: '#/$defs/verification',
    });
    expect(schema.$defs.evidence.required).toEqual(['field', 'source', 'value']);
    expect(schema.$defs.boundary.properties).not.toHaveProperty('requiredStatus');
  });

  it('publishes both stable schema subpaths', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')) as {
      exports: Record<string, unknown>;
    };
    expect(pkg.exports['./schema/enforcement-state']).toBe(
      './schemas/ark.enforcement-state.schema.json'
    );
    expect(pkg.exports['./schema/ark.enforcement-state.schema.json']).toBe(
      './schemas/ark.enforcement-state.schema.json'
    );
  });
});
