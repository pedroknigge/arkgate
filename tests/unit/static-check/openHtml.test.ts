import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { openHtmlInBrowser, shouldOpenHtmlReport } from '../../../bin/lib/open-html.mjs';

describe('shouldOpenHtmlReport', () => {
  it('opens by default for interactive TTY outside CI', () => {
    expect(
      shouldOpenHtmlReport({
        env: {},
        isTty: true,
      })
    ).toBe(true);
  });

  it('skips when CI, Vitest, or ARK_NO_OPEN_REPORT is set', () => {
    expect(shouldOpenHtmlReport({ env: { CI: 'true' }, isTty: true })).toBe(false);
    expect(shouldOpenHtmlReport({ env: { GITHUB_ACTIONS: 'true' }, isTty: true })).toBe(false);
    expect(shouldOpenHtmlReport({ env: { VITEST: 'true' }, isTty: true })).toBe(false);
    expect(shouldOpenHtmlReport({ env: { ARK_NO_OPEN_REPORT: '1' }, isTty: true })).toBe(false);
  });

  it('skips non-TTY unless forced', () => {
    expect(shouldOpenHtmlReport({ env: {}, isTty: false })).toBe(false);
    expect(shouldOpenHtmlReport({ force: true, env: { CI: 'true' }, isTty: false })).toBe(true);
  });

  it('honors --no-open over --open force', () => {
    expect(shouldOpenHtmlReport({ force: true, noOpen: true, isTty: true, env: {} })).toBe(false);
  });
});

describe('openHtmlInBrowser', () => {
  it('spawns the platform open command for an existing file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-open-html-'));
    const file = path.join(dir, 'r.html');
    fs.writeFileSync(file, '<html></html>\n');
    const calls: { cmd: string; args: string[] }[] = [];
    const fakeSpawn = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      return {
        on() {
          return this;
        },
        unref() {},
      };
    };

    const result = openHtmlInBrowser(file, {
      platform: 'darwin',
      spawn: fakeSpawn as never,
    });
    expect(result.ok).toBe(true);
    expect(result.command).toBe('open');
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('open');
    expect(calls[0].args[0]).toBe(path.resolve(file));
  });

  it('returns missing-file when the path does not exist', () => {
    const result = openHtmlInBrowser(path.join(os.tmpdir(), 'no-such-ark-report.html'), {
      platform: 'darwin',
      spawn: (() => {
        throw new Error('should not spawn');
      }) as never,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing-file');
  });

  it('does not invoke a shell for Windows paths containing metacharacters', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-open-html-'));
    const file = path.join(dir, 'report & whoami.html');
    fs.writeFileSync(file, '<html></html>\n');
    const calls: { cmd: string; args: string[]; options: { shell?: boolean } }[] = [];
    const fakeSpawn = (cmd: string, args: string[], options: { shell?: boolean }) => {
      calls.push({ cmd, args, options });
      return {
        on() {
          return this;
        },
        unref() {},
      };
    };

    const result = openHtmlInBrowser(file, {
      platform: 'win32',
      spawn: fakeSpawn as never,
    });

    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].cmd).toBe('rundll32.exe');
    expect(calls[0].args).toEqual([
      'url.dll,FileProtocolHandler',
      pathToFileURL(path.resolve(file)).href,
    ]);
    expect(calls[0].options.shell).toBe(false);
  });
});
