/**
 * REPORT-001 — `arkgate report` / `ark report` drafts an upstream GitHub issue
 * for pedroknigge/arkgate (package.json bugs.url). Never the consumer repo.
 * Default is draft-only. Submit needs --submit AND (--i-confirm-submit or TTY).
 * --yes must not submit.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  UPSTREAM_OWNER_REPO,
  formatGhIssueCreateCommand,
  ownerRepoFromGithubUrl,
  runUpstreamReportCommand,
} from '../../../bin/lib/upstream-report.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin/ark.mjs');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const ARKGATE_VERSION = String(PKG.version);

function mkTemp(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

/** Consumer tree whose GitHub remote must never be the issue target. */
function consumerRoot() {
  const root = mkTemp('ark-report-consumer-');
  write(
    root,
    'package.json',
    `${JSON.stringify({
      name: 'acme-widgets',
      repository: { type: 'git', url: 'git+https://github.com/acme/consumer-app.git' },
      bugs: { url: 'https://github.com/acme/consumer-app/issues' },
    })}\n`
  );
  write(
    root,
    '.git/config',
    '[remote "origin"]\n\turl = git@github.com:acme/consumer-app.git\n'
  );
  write(
    root,
    '.ark/reports/latest.json',
    `${JSON.stringify({
      generatedAt: '2026-09-02T12:00:00.000Z',
      ok: false,
      activeViolations: 3,
      arkVersion: ARKGATE_VERSION,
      project: 'acme-widgets',
    })}\n`
  );
  return root;
}

function isolatedEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const emptyBin = mkTemp('ark-report-path-');
  return {
    ...process.env,
    PATH: emptyBin,
    GH_TOKEN: '',
    GH_REPO: 'acme/consumer-app',
    CI: '1',
    ...extra,
  };
}

function runCli(args: string[], env: NodeJS.ProcessEnv = isolatedEnv()) {
  return spawnSync(process.execPath, [ARK, ...args], {
    encoding: 'utf8',
    env,
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('REPORT-001 upstream repo identity', () => {
  it('resolves package.json bugs.url to pedroknigge/arkgate, never a consumer remote', () => {
    expect(ownerRepoFromGithubUrl(PKG.bugs.url)).toBe('pedroknigge/arkgate');
    expect(ownerRepoFromGithubUrl(PKG.repository.url)).toBe('pedroknigge/arkgate');
    expect(UPSTREAM_OWNER_REPO).toBe('pedroknigge/arkgate');
    expect(ownerRepoFromGithubUrl('https://github.com/acme/consumer-app/issues')).toBe(
      'acme/consumer-app'
    );
    expect(formatGhIssueCreateCommand({
      repo: UPSTREAM_OWNER_REPO,
      title: 'ArkGate field report',
      body: 'body',
    })).toMatch(/^gh issue create --repo 'pedroknigge\/arkgate' /);
    expect(formatGhIssueCreateCommand({
      repo: UPSTREAM_OWNER_REPO,
      title: 'ArkGate field report',
      body: 'body',
    })).not.toMatch(/acme\/consumer-app/);
  });
});

describe('REPORT-001 draft-only', () => {
  it('prints an upstream draft with arkgate version and last-check snippet and does not call gh', async () => {
    const root = consumerRoot();
    const ghCalls: string[][] = [];
    const out: string[] = [];
    const err: string[] = [];
    const code = await runUpstreamReportCommand({
      root,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      stdinIsTTY: false,
      runGh: (argv: string[]) => {
        ghCalls.push(argv);
        return { missing: true, status: 127, stdout: '', stderr: 'gh not found' };
      },
      writeOut: (text: string) => {
        out.push(text);
      },
      writeErr: (text: string) => {
        err.push(text);
      },
    });
    const printed = out.join('\n');
    expect(code).toBe(0);
    expect(ghCalls).toEqual([]);
    expect(printed).toContain('pedroknigge/arkgate');
    expect(printed).toContain(ARKGATE_VERSION);
    expect(printed).toMatch(/last check/i);
    expect(printed).toContain('2026-09-02T12:00:00.000Z');
    expect(printed).toContain('Draft only');
    expect(printed).not.toMatch(/--repo\s+'?acme\/consumer-app/);
    expect(printed).not.toContain('https://github.com/acme/consumer-app');
  });

  it('CLI `ark report` is draft-only and names upstream, not the consumer repo', () => {
    const root = consumerRoot();
    const result = runCli(['report', '--root', root]);
    const text = `${result.stdout}\n${result.stderr}`;
    expect(result.status, text).toBe(0);
    expect(text).not.toContain('Unknown command');
    expect(text).toContain('pedroknigge/arkgate');
    expect(text).toContain(ARKGATE_VERSION);
    expect(text).toMatch(/draft/i);
    expect(text).not.toMatch(/--repo\s+'?acme\/consumer-app/);
    expect(text).not.toContain('https://github.com/acme/consumer-app');
  });
});

describe('REPORT-001 submit without confirm refused', () => {
  it('refuses --submit on a non-TTY without --i-confirm-submit and does not call gh', async () => {
    const root = consumerRoot();
    const ghCalls: string[][] = [];
    const err: string[] = [];
    const out: string[] = [];
    const code = await runUpstreamReportCommand({
      root,
      submit: true,
      yes: false,
      iConfirmSubmit: false,
      stdinIsTTY: false,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      runGh: (argv: string[]) => {
        ghCalls.push(argv);
        return { missing: false, status: 0, stdout: 'https://github.com/pedroknigge/arkgate/issues/1', stderr: '' };
      },
      writeOut: (text: string) => {
        out.push(text);
      },
      writeErr: (text: string) => {
        err.push(text);
      },
    });
    expect(code).toBe(2);
    expect(ghCalls).toEqual([]);
    expect(err.join('\n')).toMatch(/confirm|refused/i);
    expect(out.join('\n')).toContain('pedroknigge/arkgate');
  });

  it('--yes must not submit, even with --submit on a non-TTY', async () => {
    const root = consumerRoot();
    const ghCalls: string[][] = [];
    const code = await runUpstreamReportCommand({
      root,
      submit: true,
      yes: true,
      iConfirmSubmit: false,
      stdinIsTTY: false,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      runGh: (argv: string[]) => {
        ghCalls.push(argv);
        return { missing: false, status: 0, stdout: 'https://example.invalid/issues/1', stderr: '' };
      },
      writeOut: () => {},
      writeErr: () => {},
    });
    expect(code).toBe(2);
    expect(ghCalls).toEqual([]);
  });

  it('CLI `ark report --submit --yes` refuses and does not mention filing succeeded', () => {
    const root = consumerRoot();
    const result = runCli(['report', '--root', root, '--submit', '--yes']);
    const text = `${result.stdout}\n${result.stderr}`;
    expect(result.status, text).toBe(2);
    expect(text).not.toContain('Unknown argument');
    expect(text).toMatch(/confirm|refused/i);
    expect(text).not.toMatch(/created issue/i);
    expect(text).toContain('pedroknigge/arkgate');
  });
});

describe('REPORT-001 consumer repo never targeted', () => {
  it('confirmed submit still passes --repo pedroknigge/arkgate and never the consumer remote', async () => {
    const root = consumerRoot();
    const ghCalls: string[][] = [];
    const out: string[] = [];
    const code = await runUpstreamReportCommand({
      root,
      submit: true,
      iConfirmSubmit: true,
      yes: true,
      stdinIsTTY: false,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      env: isolatedEnv(),
      runGh: (argv: string[]) => {
        ghCalls.push(argv);
        if (argv[0] === 'auth') {
          return { missing: false, status: 0, stdout: 'Logged in', stderr: '' };
        }
        return { missing: false, status: 0, stdout: 'https://github.com/pedroknigge/arkgate/issues/42', stderr: '' };
      },
      writeOut: (text: string) => {
        out.push(text);
      },
      writeErr: () => {},
    });
    expect(code).toBe(0);
    expect(ghCalls.length).toBeGreaterThan(0);
    const joined = ghCalls.map((argv) => argv.join(' ')).join('\n');
    expect(joined).toContain('--repo pedroknigge/arkgate');
    expect(joined).not.toContain('acme/consumer-app');
    expect(joined).not.toContain('acme-widgets');
    for (const argv of ghCalls) {
      if (argv.includes('issue') && argv.includes('create')) {
        expect(argv).toContain('--repo');
        expect(argv).toContain('pedroknigge/arkgate');
        expect(argv).not.toContain('acme/consumer-app');
      }
    }
    expect(out.join('\n')).toContain('pedroknigge/arkgate');
  });

  it('missing gh after confirm prints draft + exact gh issue create --repo pedroknigge/arkgate and exits 2', async () => {
    const root = consumerRoot();
    const out: string[] = [];
    const err: string[] = [];
    const code = await runUpstreamReportCommand({
      root,
      submit: true,
      iConfirmSubmit: true,
      stdinIsTTY: false,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      runGh: () => ({ missing: true, status: 127, stdout: '', stderr: 'gh not found' }),
      writeOut: (text: string) => {
        out.push(text);
      },
      writeErr: (text: string) => {
        err.push(text);
      },
    });
    const text = `${out.join('\n')}\n${err.join('\n')}`;
    expect(code).toBe(2);
    expect(text).toContain('gh issue create --repo \'pedroknigge/arkgate\'');
    expect(text).toContain(ARKGATE_VERSION);
    expect(text).not.toMatch(/--repo\s+'?acme\/consumer-app/);
    expect(text).toMatch(/Not filed/i);
    expect(text).not.toMatch(/created issue|issue created/i);
  });

  it('CLI missing gh after --submit --i-confirm-submit prints the create command and exits 2', () => {
    const root = consumerRoot();
    const result = runCli(['report', '--root', root, '--submit', '--i-confirm-submit']);
    const text = `${result.stdout}\n${result.stderr}`;
    expect(result.status, text).toBe(2);
    expect(text).toContain('gh issue create --repo \'pedroknigge/arkgate\'');
    expect(text).not.toMatch(/--repo\s+'?acme\/consumer-app/);
  });
});

describe('REPORT-001 CLI wiring', () => {
  it('help lists arkgate report on the existing dual bins', () => {
    const shortHelp = runCli(['--help']);
    const allHelp = runCli(['--help', '--all']);
    const reportHelp = runCli(['report', '--help']);
    expect(shortHelp.status).toBe(0);
    expect(shortHelp.stdout).toMatch(/arkgate report/);
    expect(allHelp.status).toBe(0);
    expect(allHelp.stdout).toMatch(/arkgate report/);
    expect(allHelp.stdout).toMatch(/--i-confirm-submit/);
    expect(reportHelp.status).toBe(0);
    expect(reportHelp.stdout).toMatch(/arkgate report|ark report/);
    expect(reportHelp.stdout).toContain('pedroknigge/arkgate');
    expect(reportHelp.stdout).toMatch(/--yes/);
  });

  it('--finding drafts one finding; default title is a bundled field report', async () => {
    const root = consumerRoot();
    const oneFinding: string[] = [];
    await runUpstreamReportCommand({
      root,
      finding: 'fnv1a-deadbeef',
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      stdinIsTTY: false,
      runGh: () => ({ missing: true, status: 127, stdout: '', stderr: '' }),
      writeOut: (text: string) => {
        oneFinding.push(text);
      },
      writeErr: () => {},
    });
    expect(oneFinding.join('\n')).toContain('fnv1a-deadbeef');

    const bundled: string[] = [];
    await runUpstreamReportCommand({
      root,
      arkgateVersion: ARKGATE_VERSION,
      arkgatePackageJson: PKG,
      stdinIsTTY: false,
      runGh: () => ({ missing: true, status: 127, stdout: '', stderr: '' }),
      writeOut: (text: string) => {
        bundled.push(text);
      },
      writeErr: () => {},
    });
    expect(bundled.join('\n')).toMatch(/ArkGate field report/);
  });
});
