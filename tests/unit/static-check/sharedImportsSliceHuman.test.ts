/**
 * #313: human ark-check groups SHARED_IMPORTS_SLICE; --json and doctor keep every edge.
 */
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHECK = path.resolve('bin/ark-check.mjs');

function writeTree(root: string) {
  const config = {
    include: ['src'],
    layers: [
      { name: 'Features', patterns: ['src/ui/**', 'src/features/**'] },
      { name: 'Screens', patterns: ['src/app/**', 'src/screens/**'] },
    ],
    rules: [
      {
        from: 'Features',
        to: 'Features',
        allowed: false,
        peerIsolation: true,
        sliceFolders: ['features'],
        sharedRoots: ['ui'],
      },
      {
        from: 'Screens',
        to: 'Screens',
        allowed: false,
        peerIsolation: true,
        sliceFolders: ['screens'],
        sharedRoots: ['app'],
      },
    ],
  };
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'ark.config.json'), `${JSON.stringify(config, null, 2)}\n`);
  const files: Record<string, string> = {
    'src/features/one/a.ts': 'export const a = 1;\n',
    'src/features/two/b.ts': 'export const b = 1;\n',
    'src/features/three/c.ts': 'export const c = 1;\n',
    'src/features/four/d.ts': 'export const d = 1;\n',
    'src/features/five/e.ts': 'export const e = 1;\n',
    'src/ui/hub.ts': `import { a } from '../features/one/a';
import { b } from '../features/two/b';
import { c } from '../features/three/c';
import { d } from '../features/four/d';
import { e } from '../features/five/e';
export const hub = [a, b, c, d, e];
`,
    'src/screens/one/a.ts': 'export const a = 1;\n',
    'src/screens/two/b.ts': 'export const b = 1;\n',
    'src/screens/three/c.ts': 'export const c = 1;\n',
    'src/screens/four/d.ts': 'export const d = 1;\n',
    'src/app/hub.ts': `import { a } from '../screens/one/a';
import { b } from '../screens/two/b';
import { c } from '../screens/three/c';
import { d } from '../screens/four/d';
export const hub = [a, b, c, d];
`,
  };
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
}

function run(root: string, args: string[]) {
  const result = spawnSync('node', [CHECK, '--root', root, ...args], { encoding: 'utf8' });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('SHARED_IMPORTS_SLICE human grouping (#313)', () => {
  it('prints one summary per layer edge and keeps every edge in --json and doctor', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-shared-slice-'));
    writeTree(root);

    const human = run(root, []);
    const jsonRun = run(root, ['--json']);
    const doctor = run(root, ['--doctor']);

    expect(human.status, human.stderr).toBe(0);
    expect(jsonRun.status, jsonRun.stderr).toBe(0);
    const payload = JSON.parse(jsonRun.stdout) as {
      warnings: Array<{ ruleId: string; message: string; file?: string; count?: number }>;
    };
    const bridges = payload.warnings.filter((warning) => warning.ruleId === 'SHARED_IMPORTS_SLICE');
    expect(bridges).toHaveLength(9);
    expect(bridges.every((warning) => warning.count === undefined)).toBe(true);
    expect(bridges.filter((warning) => warning.message.includes('src/features/five/e.ts'))).toHaveLength(1);
    expect(bridges.filter((warning) => warning.message.includes('src/screens/four/d.ts'))).toHaveLength(1);
    expect(bridges.every((warning) => warning.message.includes('The wall is direct-only.'))).toBe(true);

    const summaryLines = human.stderr
      .split('\n')
      .filter((line) => line.includes('SHARED_IMPORTS_SLICE'));
    expect(summaryLines).toHaveLength(2);
    const features = summaryLines.find((line) => line.includes('Features → Features'));
    const screens = summaryLines.find((line) => line.includes('Screens → Screens'));
    expect(features).toBeDefined();
    expect(screens).toBeDefined();
    expect(features).toContain(': 5 shared-root → slice bridges');
    expect(features).toContain('src/features/one/a.ts');
    expect(features).toContain('src/features/two/b.ts');
    expect(features).toContain('src/features/three/c.ts');
    expect(features).not.toContain('src/features/four/d.ts');
    expect(features).not.toContain('src/features/five/e.ts');
    expect(features).toContain('ark-check --json');
    expect(features).toContain('ark-check --doctor');
    expect(screens).toContain(': 4 shared-root → slice bridges');
    expect(screens).toContain('ark-check --json');
    expect(screens).not.toContain('src/screens/four/d.ts');
    expect(human.stderr).not.toMatch(/shared root src\/ui\/hub\.ts → slice/);

    const doctorEdges = doctor.stdout.split('\n').filter((line) => line.includes('shared root '));
    expect(doctor.status, doctor.stderr).toBe(0);
    expect(doctorEdges).toHaveLength(9);
    expect(doctor.stdout).toContain('src/features/five/e.ts');
    expect(doctor.stdout).toContain('src/screens/four/d.ts');
    expect(doctor.stdout).not.toContain('ark-check --json');
    const doctorJson = run(root, ['--doctor', '--json']);
    const doctorPayload = JSON.parse(doctorJson.stdout) as { warnings?: unknown; doctor: { envelope?: string } };
    expect(doctorPayload.warnings).toBeUndefined();
    expect(doctorJson.stdout).not.toContain('SHARED_IMPORTS_SLICE');
  });
});
