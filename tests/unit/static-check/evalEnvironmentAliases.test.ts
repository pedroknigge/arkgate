import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repo = process.cwd();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'structrail-eval-env-'));

afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('Structrail eval environment aliases', () => {
  it('gives STRUCTRAIL_EVAL_CASE precedence before invoking a live agent', () => {
    const result = spawnSync(process.execPath, [path.join(repo, 'eval', 'run.mjs')], {
      cwd: repo,
      encoding: 'utf8',
      env: {
        ...process.env,
        STRUCTRAIL_EVAL_CASE: 'missing-case',
        ARK_EVAL_CASE: 'enthusiast-greenfield-crud',
      },
    });

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('No cases to run');
  });

  it('gives STRUCTRAIL_EVAL_LOOP_CASE precedence in the deterministic harness', () => {
    const result = spawnSync(
      process.execPath,
      [path.join(repo, 'eval', 'loop-cost-run.mjs')],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          STRUCTRAIL_EVAL_LOOP_CASE: 'import-type-of-type-exports',
          ARK_EVAL_LOOP_CASE: 'missing-case',
          STRUCTRAIL_EVAL_KEEP: '',
          ARK_EVAL_KEEP: '1',
        },
      }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stderr).toContain('import-type-of-type-exports');
    expect(result.stderr).not.toContain('unknown case');
  });

  it('writes comparative output to the canonical path when both names exist', () => {
    const canonical = path.join(tmp, 'structrail-comparative.json');
    const legacy = path.join(tmp, 'ark-comparative.json');
    const result = spawnSync(
      process.execPath,
      [path.join(repo, 'eval', 'comparative-run.mjs')],
      {
        cwd: repo,
        encoding: 'utf8',
        env: {
          ...process.env,
          STRUCTRAIL_COMPARATIVE_OUT: canonical,
          ARK_COMPARATIVE_OUT: legacy,
        },
      }
    );

    expect(result.status, result.stderr).toBe(0);
    expect(fs.existsSync(canonical)).toBe(true);
    expect(fs.existsSync(legacy)).toBe(false);
  });
});
