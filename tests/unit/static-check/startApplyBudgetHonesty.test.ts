/**
 * #274 — compact start size refuse is stranger-clear Contener first-run.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MATURE_REPO_FILE_THRESHOLD,
  buildArchitectureRecommendation,
} from '../../../bin/ark-shared.mjs';
import { setupUsage } from '../../../bin/lib/first-run-help.mjs';
import { emitStartSetupBudgetRefuse } from '../../../bin/lib/start-preview.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function mkTemp(prefix: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(root);
  return root;
}

describe('#274 start --apply size lock honesty', () => {
  it('start() checks the size gate before any applying:true render', () => {
    const src = fs.readFileSync(path.join(REPO, 'bin/ark.mjs'), 'utf8');
    const budgetIdx = src.indexOf('evaluateStartSetupBudgetGate');
    const emitIdx = src.indexOf('emitStartSetupBudgetRefuse');
    const writingIdx = src.indexOf("renderStartPreview(preview, { applying: true })");
    expect(budgetIdx).toBeGreaterThan(-1);
    expect(emitIdx).toBeGreaterThan(-1);
    expect(writingIdx).toBeGreaterThan(-1);
    expect(budgetIdx).toBeLessThan(writingIdx);
    expect(emitIdx).toBeLessThan(writingIdx);
  });

  it('human apply refuse is emitted before any writing copy', () => {
    const lines: string[] = [];
    const err: string[] = [];
    const origLog = console.log;
    const origErr = console.error;
    console.log = (value = '') => {
      lines.push(String(value));
    };
    console.error = (value = '') => {
      err.push(String(value));
    };
    try {
      emitStartSetupBudgetRefuse(
        {
          setupBudget: {
            files: 11,
            gateFiles: 11,
            arkrulesFiles: 0,
            bytes: 45_000,
            maxFiles: 8,
            maxBytes: 32 * 1024,
            ok: false,
          },
          changes: [{ path: 'ark.config.json' }],
        },
        false
      );
    } finally {
      console.log = origLog;
      console.error = origErr;
    }
    const blob = `${err.join('\n')}\n${lines.join('\n')}`;
    expect(blob).toMatch(/Refusing ark start --apply/);
    expect(blob).toMatch(/11 gate files \(max 8\)/);
    expect(blob).toMatch(/Next: arkgate-check --init/);
    expect(blob).not.toMatch(/writing /);
    expect(blob).not.toMatch(/Compact setup budget/);
  });

  it('JSON apply refuse uses start-setup-budget-gate and keeps --force a no-op', () => {
    const printed: string[] = [];
    const origLog = console.log;
    console.log = (value = '') => {
      printed.push(String(value));
    };
    try {
      emitStartSetupBudgetRefuse(
        {
          setupBudget: {
            files: 11,
            gateFiles: 11,
            arkrulesFiles: 0,
            bytes: 45_000,
            maxFiles: 8,
            maxBytes: 32 * 1024,
            ok: false,
          },
        },
        true
      );
    } finally {
      console.log = origLog;
    }
    const payload = JSON.parse(printed.join('')) as {
      ok: boolean;
      error: string;
      forceBypasses: boolean;
      nextAction: string;
    };
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe('start-setup-budget-gate');
    expect(payload.forceBypasses).toBe(false);
    expect(payload.nextAction).toBe('arkgate-check --init');
  });

  it('setup help documents size refuse next to coverage/shape and does not sell --force as the size unlock', () => {
    const help = setupUsage();
    expect(help).toMatch(/weak coverage\/shape/);
    expect(help).toMatch(/--archetype\/--preset\/--force/);
    expect(help).toMatch(/too big for compact start/);
    expect(help).toMatch(/arkgate-check --init/);
  });

  it('mature recommend firstCommand is --init, not cold start --apply', () => {
    const root = mkTemp('ark-274-mature-');
    fs.writeFileSync(path.join(root, 'package.json'), '{"name":"mature-dogfood"}\n');
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    for (let i = 0; i < MATURE_REPO_FILE_THRESHOLD; i += 1) {
      fs.writeFileSync(path.join(root, `src/f${i}.ts`), `export const n${i} = ${i};\n`);
    }
    const rec = buildArchitectureRecommendation(root);
    expect(rec.mature).toBe(true);
    expect(rec.firstCommand).toMatch(/ark-check --init/);
    expect(rec.firstCommand).not.toMatch(/start --apply/);
    expect(rec.adoptCommand).toMatch(/--recommend --write-plan/);
  });
});
