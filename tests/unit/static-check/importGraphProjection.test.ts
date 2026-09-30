/**
 * ADR 0037 D1 — the importer index is a projection of resolved facts. The
 * verdict and factsHash are byte-identical with and without it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';
import { afterEach, describe, expect, it } from 'vitest';
import { runArchitectureScan } from '../../../bin/lib/architecture-scan.mjs';
import {
  importerGraphFromIndex,
  projectImporterIndex,
} from '../../../bin/lib/import-graph-projection.mjs';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'Application', patterns: ['src/app/**'] },
  ],
  rules: [{ from: 'DomainModel', to: 'Application', allowed: false }],
};

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-import-graph-'));
  roots.push(root);
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  write('ark.config.json', JSON.stringify(CONFIG));
  write('src/domain/types.ts', 'export type Money = number;\nexport interface Order { total: Money }\n');
  write('src/domain/order.ts', "import type { Money } from './types';\nexport const zero: Money = 0;\nexport function total(): Money { return zero; }\n");
  write('src/domain/index.ts', "export * from './order';\nexport { total as sum } from './order';\n");
  write('src/app/use-case.ts', "import { total } from '../domain/order';\nimport * as all from '../domain/index';\nexport const run = () => total() + all.zero;\n");
  write('src/app/lazy.ts', "export async function load(name: string) {\n  const mod = await import(`./handlers/${name}`);\n  return mod;\n}\nimport './missing-file';\n");
  write('src/app/handlers/a.ts', 'export const a = 1;\n');
  write('src/domain/leak.ts', "import { run } from '../app/use-case';\nexport const leak = run;\n");
  write('src/app/orphan.ts', 'export const nobody = true;\n');
  return root;
}

function scan(root: string, graphProjection: boolean) {
  return runArchitectureScan({
    root,
    config: CONFIG,
    manifest: null,
    rules: CONFIG.rules,
    files: [],
    ts,
    args: { config: 'ark.config.json' },
    ...(graphProjection ? { graphProjection: true } : {}),
  });
}

describe('importer index projection', () => {
  it('keeps the verdict and factsHash byte-identical', () => {
    const root = project();
    const plain = scan(root, false);
    const projected = scan(root, true);
    const { importGraph, ...verdict } = projected;
    expect(importGraph).toBeDefined();
    expect('importGraph' in plain).toBe(false);
    expect(JSON.stringify(verdict)).toBe(JSON.stringify(plain));
    expect(verdict.factsHash).toBe(plain.factsHash);
    expect(verdict.valid).toBe(plain.valid);
    expect(verdict.violations.length).toBeGreaterThan(0);
  });

  it('counts every resolved project edge, including type-only and re-exports', () => {
    const root = project();
    const { importGraph } = scan(root, true);
    const count = (file: string) => importGraph.importerCount[importGraph.files.indexOf(file)];
    expect(count('src/domain/types.ts')).toBe(1); // import type
    expect(count('src/domain/order.ts')).toBe(3); // re-export ×2 + named import
    expect(count('src/domain/index.ts')).toBe(1); // namespace import
    expect(count('src/app/orphan.ts')).toBe(0);
    expect(count('src/app/handlers/a.ts')).toBe(0);
    expect(importGraph.dynamicSites).toBe(1);
    expect(importGraph.unresolvedTotal).toBe(1);
    expect(importGraph.unresolved[0]).toMatchObject({ from: 'src/app/lazy.ts', specifier: './missing-file' });
    expect(importGraph.edges).toBeInstanceOf(Int32Array);
    expect(importGraph.importerCount).toBeInstanceOf(Uint32Array);
  });

  it('records named use, and star use for namespace / export * edges', () => {
    const root = project();
    const { importGraph } = scan(root, true);
    const use = (file: string) => importGraph.namedUse.get(importGraph.files.indexOf(file));
    expect(use('src/domain/order.ts')).toBe('*'); // export * from './order'
    expect(use('src/domain/index.ts')).toBe('*'); // import * as all
    expect([...(use('src/domain/types.ts') as Set<string>)]).toEqual(['Money']);
  });

  it('builds the flat-parent importer graph from the index', () => {
    const root = project();
    const { importGraph } = scan(root, true);
    const graph = importerGraphFromIndex(importGraph);
    expect([...(graph.get('src/domain/order.ts') ?? [])].sort()).toEqual([
      'src/app/use-case.ts',
      'src/domain/index.ts',
    ]);
  });

  it('projects nothing from missing facts', () => {
    const empty = projectImporterIndex(undefined);
    expect(empty.files).toEqual([]);
    expect(empty.completeness).toBe('unavailable');
  });
});
