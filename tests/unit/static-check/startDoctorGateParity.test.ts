/**
 * Issue #210: start --apply must leave write-path gates doctor accepts,
 * including repos that already have project-owned AGENTS.md / .mcp.json.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { missingGates } from '../../../bin/lib/gate-files.mjs';

const execFileAsync = promisify(execFile);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const ARK = path.join(REPO, 'bin/ark.mjs');
const ARK_CHECK = path.join(REPO, 'bin/ark-check.mjs');
const TMP_ROOTS: string[] = [];

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-start-doctor-parity-'));
  TMP_ROOTS.push(root);
  return root;
}

function write(root: string, rel: string, body: string) {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, body);
}

afterEach(() => {
  while (TMP_ROOTS.length > 0) {
    const root = TMP_ROOTS.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

describe('start --apply / doctor gate parity (#210)', () => {
  it('merges project-owned AGENTS.md and .mcp.json so doctor does not list them missing', async () => {
    const root = tmpRoot();
    write(
      root,
      'package.json',
      JSON.stringify({ name: 'zod-like', private: true, version: '0.0.0' }, null, 2)
    );
    write(root, 'src/index.ts', 'export const n = 1;\n');
    write(
      root,
      'AGENTS.md',
      '# Zod\n\nProject-owned agent notes. Do not wipe this file.\n'
    );
    write(
      root,
      '.mcp.json',
      `${JSON.stringify(
        {
          mcpServers: {
            docs: { command: 'npx', args: ['docs-mcp'] },
          },
        },
        null,
        2
      )}\n`
    );

    const apply = await execFileAsync(
      process.execPath,
      [
        ARK,
        'start',
        '--root',
        root,
        '--tools',
        'cursor',
        '--yes',
        '--no-install',
        '--no-strict',
        '--apply',
      ],
      { encoding: 'utf8', env: { ...process.env, ARK_ACTIVE_HOST: 'cursor' } }
    );
    expect(apply.stdout + apply.stderr).not.toMatch(/Refusing ark start --apply/);

    const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Project-owned agent notes');
    expect(agents).toMatch(/#\s*Ark(?:Gate)?\s+Enforcement/);
    expect(agents).toMatch(/ark\.config\.json/i);

    const mcp = JSON.parse(fs.readFileSync(path.join(root, '.mcp.json'), 'utf8')) as {
      mcpServers?: { docs?: { args?: string[] }; ark?: { args?: string[] } };
    };
    expect(mcp.mcpServers?.docs?.args).toEqual(['docs-mcp']);
    expect(mcp.mcpServers?.ark?.args).toEqual(
      expect.arrayContaining(['--root', '.', '--config', 'ark.config.json'])
    );

    expect(missingGates(root)).not.toContain('AGENTS.md');
    expect(missingGates(root)).not.toContain('.mcp.json');

    const doctor = await execFileAsync(
      process.execPath,
      [ARK_CHECK, '--root', root, '--doctor', '--json'],
      { encoding: 'utf8' }
    );
    const payload = JSON.parse(doctor.stdout) as { doctor?: { gatesMissing?: string[] } };
    const missing = payload.doctor?.gatesMissing ?? [];
    expect(missing).not.toContain('AGENTS.md');
    expect(missing).not.toContain('.mcp.json');
  }, 120_000);
});
