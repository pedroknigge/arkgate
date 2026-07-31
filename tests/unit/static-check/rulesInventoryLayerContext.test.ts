import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ARK_CHECK = path.resolve('bin/ark-check.mjs');

describe('ArkRules inventory layer context', () => {
  it('uses custom layer intent prefixes instead of relying on conventional names', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-rules-layer-context-'));
    try {
      fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
      fs.mkdirSync(path.join(root, 'src/http'), { recursive: true });
      fs.writeFileSync(
        path.join(root, 'ark.config.json'),
        `${JSON.stringify(
          {
            include: ['src'],
            layers: [
              {
                name: 'core',
                patterns: ['src/domain/**'],
                intentPrefixes: ['Domain.'],
              },
              {
                name: 'entry',
                patterns: ['src/http/**'],
                intentPrefixes: ['Application.'],
              },
            ],
            rules: [],
          },
          null,
          2
        )}\n`
      );
      const controllerSource = `
        export function handle(input: { amount: number }) {
          if (input.amount < 0) throw new Error('invalid amount');
          return input.amount;
        }
      `;
      fs.writeFileSync(path.join(root, 'src/domain/order-handler.ts'), controllerSource);
      fs.writeFileSync(path.join(root, 'src/http/order-handler.ts'), controllerSource);

      const output = execFileSync(
        process.execPath,
        [
          ARK_CHECK,
          '--root',
          root,
          '--config',
          path.join(root, 'ark.config.json'),
          '--rules-inventory',
          '--json',
        ],
        { encoding: 'utf8', stdio: 'pipe' }
      );
      const result = JSON.parse(output) as {
        rulesInventory: {
          candidates: Array<{
            kind: string;
            file: string;
            governedLayer?: string;
          }>;
        };
      };
      const validationCandidates = result.rulesInventory.candidates.filter(
        (candidate) => candidate.kind === 'validation-in-controller'
      );

      expect(validationCandidates.length).toBeGreaterThan(0);
      expect(
        validationCandidates.every(
          (candidate) =>
            candidate.file === 'src/http/order-handler.ts' &&
            candidate.governedLayer === 'entry'
        )
      ).toBe(true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
