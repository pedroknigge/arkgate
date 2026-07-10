/**
 * Shared fixtures for Q1 branch-coverage surface tests.
 * Keep mk/writeTree here so suite files stay focused on assertions.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);

export function mk(prefix = 'ark-q1-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function rm(root: string): void {
  fs.rmSync(root, { recursive: true, force: true });
}

/** Write a relative path map under root (creates parent dirs). */
export function writeTree(root: string, files: Record<string, string>): void {
  for (const [rel, body] of Object.entries(files)) {
    const abs = path.join(root, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
}

export function loadTypescript(): typeof import('typescript') {
  return nodeRequire('typescript');
}
