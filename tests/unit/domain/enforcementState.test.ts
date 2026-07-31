import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { ARK_ENFORCEMENT_STATE_SCHEMA_VERSION } from '../../../src/gate';
import {
  buildEnforcementState,
  enforcementDoctorLines,
  packageInstallation,
} from '../../../bin/lib/enforcement-state.mjs';

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
      'runtimeObserved',
      'operation',
      'operationCoverage',
      'bypassable',
      'required',
      'hard',
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

  it('renders the packaged enforcement boundary from installation and runtime evidence', () => {
    expect(packageInstallation(process.cwd())).toMatchObject({
      installed: true,
      selfHost: true,
    });
    expect(packageInstallation(path.join(os.tmpdir(), 'arkgate-not-installed'))).toMatchObject({
      installed: false,
      selfHost: false,
    });

    const model = {
      activeHost: 'unknown',
      support: {
        capabilities: {
          'hard-write': true,
          'advisory-write': true,
        },
      },
      capabilityEvidence: {
        'hard-write': ['.grok/hooks/ark-write-gate.json'],
        'advisory-write': ['.mcp.json'],
        'merge-gate': ['.github/workflows/ark-check.yml'],
      },
      enforcementLadder: {
        localWrite: {
          hard: true,
        },
      },
      ci: {
        failClosed: true,
      },
    };
    const enforcement = buildEnforcementState(process.cwd(), model);
    const rows = enforcementDoctorLines(enforcement);

    expect(enforcement.localWrite).toMatchObject({
      installed: true,
      active: 'unverified',
      runtimeObserved: false,
      hard: false,
    });
    expect(rows.map((row) => row.level)).toEqual(['warn', 'warn', 'warn', 'bad', 'warn']);
    expect(rows[0]?.text).toContain('operation: none');
    expect(rows.some((row) => row.text.includes('Active host unknown'))).toBe(true);

    const observed = buildEnforcementState(process.cwd(), {
      ...model,
      activeHost: 'grok',
      enforcementLadder: {
        localWrite: {
          hard: true,
          operation: 'Write',
          operationCovered: true,
        },
      },
    });
    expect(observed.localWrite).toMatchObject({
      active: true,
      runtimeObserved: true,
      operationCoverage: true,
      bypassable: false,
      hard: true,
    });
    expect(enforcementDoctorLines(observed)[0]?.level).toBe('ok');
  });
});
