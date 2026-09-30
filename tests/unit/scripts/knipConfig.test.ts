/**
 * knip.jsonc skips unused-export checks only on generated artifacts, and on every one of
 * them: a new generated mirror must be listed, a hand-written module must never be.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readKnipConfig(): { ignoreIssues?: Record<string, string[]> } {
  const text = fs
    .readFileSync(path.join(root, 'knip.jsonc'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*\/\//.test(line))
    .join('\n');
  return JSON.parse(text) as { ignoreIssues?: Record<string, string[]> };
}

const GENERATED_BANNER = /GENERATED FILE — do not edit by hand|^\/\/ GENERATED from |^\/\/ Generated from /m;

function generatedArtifacts(): string[] {
  const out: string[] = [];
  for (const dir of ['bin', 'bin/lib']) {
    for (const name of fs.readdirSync(path.join(root, dir))) {
      if (!name.endsWith('.mjs') || name.endsWith('.source.mjs')) continue;
      const rel = `${dir}/${name}`;
      const head = fs.readFileSync(path.join(root, rel), 'utf8').slice(0, 400);
      if (GENERATED_BANNER.test(head)) out.push(rel);
    }
  }
  return out.sort();
}

describe('knip.jsonc', () => {
  it('ignores unused exports on exactly the generated bin artifacts', () => {
    const ignored = Object.entries(readKnipConfig().ignoreIssues ?? {})
      .filter(([, kinds]) => kinds.includes('exports'))
      .map(([file]) => file)
      .sort();
    const generated = generatedArtifacts();
    expect(generated.length).toBeGreaterThan(40);
    expect(ignored).toEqual(generated);
  });
});
