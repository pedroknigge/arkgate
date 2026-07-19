import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  architectureConfig,
  materializedTaskFiles,
  taskPrompt,
  writeTaskFiles,
} from '../../../eval/causal/task-materialize.mjs';

const roots: string[] = [];
const scenarios = [
  'clock-boundary',
  'repository-port',
  'presentation-mapper',
  'cycle-extraction',
];

afterEach(() => {
  while (roots.length > 0) fs.rmSync(roots.pop()!, { recursive: true, force: true });
});

describe('Z08 held-out task materializer', () => {
  for (const [index, scenario] of scenarios.entries()) {
    it(`prequalifies the ${scenario} oracle and rejects the fixture`, async () => {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-z08-task-'));
      roots.push(root);
      const task = { id: `repo-${scenario}`, repositoryId: 'repo', scenario, noun: `Subject${index}` };
      const taskPath = path.join(root, 'task.json');
      fs.writeFileSync(taskPath, JSON.stringify(task));
      const configPath = path.join(root, 'ark.config.json');
      fs.writeFileSync(configPath, JSON.stringify(architectureConfig(task)));
      const accept = (compiledRoot: string) => spawnSync(process.execPath, [
        path.resolve('eval/causal/accept-task.mjs'),
        '--task', taskPath,
        '--compiled-root', compiledRoot,
      ], { cwd: path.resolve('.'), encoding: 'utf8' });
      const checkArchitecture = () => spawnSync(process.execPath, [
        path.resolve('bin/ark-check.mjs'),
        '--root', root,
        '--config', configPath,
        '--strict-config',
        '--json',
        '--no-cache',
      ], { cwd: path.resolve('.'), encoding: 'utf8' });
      const compile = () => {
        const out = path.join(root, 'compiled');
        fs.rmSync(out, { recursive: true, force: true });
        execFileSync(process.execPath, [
          path.resolve('node_modules/typescript-ark-host/lib/tsc.js'),
          '--ignoreConfig',
          '--strict',
          '--target', 'ES2022',
          '--module', 'NodeNext',
          '--moduleResolution', 'NodeNext',
          '--skipLibCheck',
          '--rootDir', root,
          '--outDir', out,
          ...Object.keys(materializedTaskFiles(task)).map((file) => path.join(root, file)),
        ], { cwd: path.resolve('.') });
        return out;
      };

      writeTaskFiles(root, task, 'fixture');
      const fixtureOut = compile();
      expect(accept(fixtureOut).status).toBe(1);
      expect(checkArchitecture().status).toBe(1);

      writeTaskFiles(root, task, 'oracle');
      const oracleOut = compile();
      const accepted = accept(oracleOut);
      expect(accepted.status, accepted.stderr).toBe(0);
      const architecture = checkArchitecture();
      expect(architecture.status, architecture.stderr || architecture.stdout).toBe(0);
      expect(taskPrompt(task)).toContain(`z08-task/${task.id}`);
      expect(architectureConfig(task).include).toEqual([`z08-task/${task.id}`]);
    });
  }

  it('rejects unknown scenarios and unsafe task identifiers', () => {
    expect(() => taskPrompt({ id: '../escape', scenario: 'clock-boundary', noun: 'Subject' })).toThrow();
    expect(() => materializedTaskFiles({ id: 'safe-task', scenario: 'unknown', noun: 'Subject' })).toThrow();
  });

  it('keeps all 24 generated prompts byte-identical to the catalog', () => {
    const result = spawnSync(process.execPath, [
      path.resolve('scripts/generate-z08-task-prompts.mjs'),
      '--check',
    ], { cwd: path.resolve('.'), encoding: 'utf8' });
    expect(result.status, result.stderr || result.stdout).toBe(0);
    expect(result.stdout).toMatch(/Verified 24 Z08 prompts/);
  });
});
