import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const runner = path.join(repo, 'eval/mechanical-edit-hygiene-run.mjs');

describe('Y04 mechanical-edit hygiene eval', () => {
  it('keeps all three field defects closed in every mechanical-edit skill', () => {
    const result = spawnSync(process.execPath, [runner], {
      cwd: repo,
      encoding: 'utf8',
    });
    expect(result.status, result.stderr).toBe(0);
    const report = JSON.parse(result.stdout) as {
      mode: string;
      passed: boolean;
      skills: string[];
      requiredOutcomes: number;
      cases: Array<{ id: string; passed: boolean }>;
    };
    expect(report).toMatchObject({
      mode: 'fixture-measured',
      passed: true,
      requiredOutcomes: 4,
      skills: [
        'templates/skills/ark-fix.md',
        'templates/skills/ark-autopilot.md',
        'templates/skills/ark-loop.md',
      ],
    });
    expect(report.cases).toEqual([
      { id: 'merge-existing-doc-comment', passed: true },
      { id: 'preserve-typed-define-route', passed: true },
      { id: 'no-empty-placeholder', passed: true },
    ]);
  });
});
