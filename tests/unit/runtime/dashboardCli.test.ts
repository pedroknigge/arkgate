/**
 * ark-dashboard CLI: help/version/unknown flags, inspector root URL, clamped
 * intervals, and the ephemeral-port hint when no URL was given.
 */
import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  DASHBOARD_HELP,
  clampDashboardMs,
  dashboardSiblingUrl,
} from '../../../bin/lib/dashboard-cli.mjs';
import { createStrictArkKernel, type ArkRunInspectorHandle } from '../../../src/index';

const execFileAsync = promisify(execFile);
const ROOT = process.cwd();
const DASHBOARD = path.join(ROOT, 'bin/ark-dashboard.mjs');

type RunResult = { code: number; stdout: string; stderr: string };

async function runDashboard(args: string[], env: NodeJS.ProcessEnv = {}): Promise<RunResult> {
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [DASHBOARD, ...args], {
      env: { ...process.env, ARK_DASHBOARD_URL: '', ...env },
      timeout: 20_000,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const e = error as { code?: number; stdout?: string; stderr?: string };
    return { code: e.code ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const handles: ArkRunInspectorHandle[] = [];
afterEach(async () => {
  while (handles.length > 0) await handles.pop()?.close();
});

describe('dashboard URL + interval helpers', () => {
  it('maps root, bare origin, /snapshot, /snapshot/ and prefix mounts to sibling routes', () => {
    const cases: Array<[string, string]> = [
      ['http://127.0.0.1:1/', 'http://127.0.0.1:1/outbox'],
      ['http://127.0.0.1:1', 'http://127.0.0.1:1/outbox'],
      ['http://127.0.0.1:1/snapshot', 'http://127.0.0.1:1/outbox'],
      ['http://127.0.0.1:1/snapshot/', 'http://127.0.0.1:1/outbox'],
      ['http://127.0.0.1:1/x/snapshot', 'http://127.0.0.1:1/x/outbox'],
      ['http://127.0.0.1:1/snapshot?x=1#y', 'http://127.0.0.1:1/outbox'],
    ];
    for (const [input, expected] of cases) {
      expect(dashboardSiblingUrl(input, '/outbox')).toBe(expected);
    }
    expect(dashboardSiblingUrl('not a url', '/outbox')).toBeNull();
  });

  it('clamps out-of-range intervals instead of silently resetting them', () => {
    expect(clampDashboardMs('100', 2000)).toBe(200);
    expect(clampDashboardMs('999999', 2000)).toBe(60_000);
    expect(clampDashboardMs('750', 2000)).toBe(750);
    expect(clampDashboardMs('abc', 2000)).toBe(2000);
    expect(clampDashboardMs(undefined, 2000)).toBe(2000);
  });
});

describe('ark-dashboard bin', () => {
  it('prints help and exits 0 for --help and -h', async () => {
    for (const flag of ['--help', '-h']) {
      const result = await runDashboard([flag]);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toBe(DASHBOARD_HELP);
    }
  });

  it('prints the package version for --version', async () => {
    const result = await runDashboard(['--version']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('rejects unknown flags with one line and exit 2, no stack trace', async () => {
    const result = await runDashboard(['--bogus']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("Unknown option '--bogus'");
    expect(result.stderr).not.toMatch(/at file:\/\//);
  });

  it('renders queues when pointed at the inspector root (handle.url)', async () => {
    const ark = createStrictArkKernel();
    const handle = await ark.startInspector({ port: 0, nodeEnv: 'test' });
    handles.push(handle);
    expect(handle.url.endsWith('/')).toBe(true);
    const result = await runDashboard(['--url', handle.url, '--once']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Outbox: pending=0 failed=0');
    expect(result.stdout).not.toContain('Waiting for queues');
  });

  it('routes //outbox on the inspector as /outbox, not as the snapshot', async () => {
    const ark = createStrictArkKernel();
    const handle = await ark.startInspector({ port: 0, nodeEnv: 'test' });
    handles.push(handle);
    const body = (await (await fetch(`${handle.url}/outbox`)).json()) as {
      available?: boolean;
    };
    expect(body.available).toBe(true);
  });

  it('explains the ephemeral inspector port when the default URL fails', async () => {
    const result = await runDashboard([
      '--once',
      '--timeout',
      '300',
      '--url',
      '',
    ]);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain('Failure contacting kernel');
    expect(result.stdout).toContain('startInspector() binds a random port');
  });
});
