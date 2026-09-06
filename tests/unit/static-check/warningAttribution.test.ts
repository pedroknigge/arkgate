/**
 * Issue #203 — advisory warnings and design-smell summaries must name a
 * path:line (or say they are not a file) so a consumer can tell whether
 * their change caused the line.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = path.resolve('.');
const arkCheck = path.join(repoRoot, 'bin/ark-check.mjs');
const temps: string[] = [];

function mk(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-warning-attribution-'));
  temps.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of temps.splice(0)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
});

function run(args: string[], cwd: string) {
  return spawnSync(process.execPath, [arkCheck, ...args], {
    encoding: 'utf8',
    cwd,
    env: { ...process.env, NO_COLOR: '1', ARK_NO_OPEN_REPORT: '1' },
  });
}

function advisoryOrderRepo(): string {
  const root = mk();
  fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/domain/billing.ts'), 'export type Plan = "free" | "pro";\n');
  fs.writeFileSync(
    path.join(root, 'src/main.ts'),
    `import { createOrderPlane } from 'arkgate/order';

export function boot(): void {
  const plane = createOrderPlane({
    projector: () => ({ allowedKinds: ['InvoicePosted'], invalidated: [] }),
  });
  plane.release({ plan: 'free' });
  plane.update({ plan: 'pro' });
}
`
  );
  fs.writeFileSync(
    path.join(root, 'ark.config.json'),
    JSON.stringify({
      schemaVersion: '1.3',
      include: ['src'],
      layers: [
        { name: 'DomainModel', patterns: ['src/domain/**'] },
        { name: 'ApplicationOrchestration', patterns: ['src/main.ts'] },
      ],
      rules: [{ from: 'ApplicationOrchestration', to: 'DomainModel', allowed: true }],
      arkOrder: {
        mode: 'advisory',
        planeRoots: ['src/main.ts'],
        managedLayers: ['ApplicationOrchestration'],
        maxXiKeys: 7,
        xiKeys: ['plan'],
      },
    })
  );
  return root;
}

describe('ark-check warning attribution (#203)', () => {
  it('prints path:line on an advisory ARKORDER_GENERIC_UPDATE', () => {
    const root = advisoryOrderRepo();
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    expect(out).toMatch(/warning ARKORDER_GENERIC_UPDATE src\/main\.ts:\d+/);
    expect(out).toContain('src/main.ts:');
    expect(out).not.toMatch(/warning ARKORDER_GENERIC_UPDATE Generic /);
  });

  it('prints path:line on duplicate ARKORDER_XI_FIELD_WRITE so copies are distinguishable', () => {
    const root = mk();
    fs.mkdirSync(path.join(root, 'src/application'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'src/application/approve.ts'),
      `import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export async function approve(id: string): Promise<void> {
  await prisma.order.update({ where: { id }, data: { approved_at: new Date() } });
}
`
    );
    fs.writeFileSync(
      path.join(root, 'src/application/role.ts'),
      `import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
export async function setRole(id: string, role: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { role } });
}
`
    );
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        schemaVersion: '1.3',
        include: ['src'],
        layers: [{ name: 'ApplicationOrchestration', patterns: ['src/application/**'] }],
        rules: [],
        arkOrder: {
          mode: 'advisory',
          planeRoots: ['src/application/**'],
          managedLayers: ['ApplicationOrchestration'],
          maxXiKeys: 7,
          xiKeys: ['approved_at', 'role'],
        },
      })
    );
    const res = run(['--root', root, '--config', 'ark.config.json'], root);
    const out = `${res.stdout || ''}${res.stderr || ''}`;
    const lines = out
      .split('\n')
      .filter((line) => line.includes('warning ARKORDER_XI_FIELD_WRITE'));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    expect(lines.some((line) => /src\/application\/approve\.ts:\d+/.test(line))).toBe(true);
    expect(lines.some((line) => /src\/application\/role\.ts:\d+/.test(line))).toBe(true);
  });
});
