import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { runFuzz } from '../helpers/fuzz';

const mcpBin = path.resolve(process.cwd(), 'bin/ark-mcp.mjs');

describe('hook payload fuzzing', () => {
  let root: string;

  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-fuzz-hook-'));
    fs.mkdirSync(path.join(root, 'src/domain'), { recursive: true });
    fs.writeFileSync(
      path.join(root, 'ark.config.json'),
      JSON.stringify({
        include: ['src'],
        layers: [{ name: 'DomainModel', patterns: ['src/domain/**'] }],
        rules: [],
      })
    );
  });

  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  it('never silently allows a randomized forbidden Write payload', () => {
    runFuzz(
      'hook-payload',
      fc.property(fc.string({ maxLength: 128 }), (noise) => {
        const result = spawnSync(process.execPath, [mcpBin, '--hook', '--root', root], {
          input: JSON.stringify({
            tool_name: 'Write',
            tool_input: {
              file_path: path.join(root, 'src/domain', `${noise.replaceAll('/', '_') || 'model'}.ts`),
              content: "import { PrismaClient } from 'prisma'; export const db = new PrismaClient();",
            },
          }),
          encoding: 'utf8',
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(2);
        expect(result.stderr).toContain('FORBIDDEN_IMPORT');
      }),
      { numRuns: 25, timeLimitMs: 15000 }
    );
  });

  it('fails open only for malformed payloads and does not crash', () => {
    runFuzz(
      'hook-payload-malformed',
      fc.property(fc.string({ maxLength: 256 }), (payload) => {
        const result = spawnSync(process.execPath, [mcpBin, '--hook', '--root', root], {
          input: payload,
          encoding: 'utf8',
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
      }),
      { numRuns: 20, timeLimitMs: 12000 }
    );
  });

  it('never lets traversal-shaped hook paths affect files outside the project root', () => {
    runFuzz(
      'hook-payload-traversal',
      fc.property(fc.stringMatching(/^[a-z0-9]{1,24}$/), (name) => {
        const outside = path.resolve(root, '..', `${name}.ts`);
        const result = spawnSync(process.execPath, [mcpBin, '--hook', '--root', root], {
          input: JSON.stringify({
            tool_name: 'Write',
            tool_input: {
              file_path: outside,
              content: "import { PrismaClient } from 'prisma'; export const db = new PrismaClient();",
            },
          }),
          encoding: 'utf8',
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(0);
        expect(fs.existsSync(outside)).toBe(false);
      }),
      { numRuns: 20, timeLimitMs: 12000 }
    );
  });
});
