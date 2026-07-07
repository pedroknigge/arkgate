import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  loadArchitecturePlaybook,
  scoreArchetypes,
} from '../../../bin/ark-shared.mjs';

const PLAYBOOK_PATH = path.resolve('templates/architecture-playbook.json');
const ARK_CHECK = path.resolve('bin/ark-check.mjs');

const ARCHETYPE_IDS = new Set([
  'crud-product',
  'api-backend',
  'frontend-surface',
  'library-sdk',
  'cli-utility',
  'worker-pipeline',
  'event-coordinator',
  'integration-bridge',
  'multi-app-workspace',
  'prototype-spike',
]);

function mkTempDir(prefix: string) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFile(file: string, content: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function runRecommendJson(root: string) {
  const stdout = execFileSync('node', [ARK_CHECK, '--root', root, '--recommend', '--json'], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout) as {
    ok: boolean;
    archetype: string;
    preset: string;
    confidence: number;
    adoptInOrder: { phase1: string[] };
    runnerUp: { id: string };
    why: string[];
  };
}

function recommendTopArchetype(root: string) {
  const playbook = loadArchitecturePlaybook(PLAYBOOK_PATH);
  const signals = collectRepoShapeSignals(root);
  return scoreArchetypes(signals, playbook).archetype;
}

describe('architecture-playbook.json', () => {
  it('defines exactly 10 tool-agnostic archetypes', () => {
    const playbook = loadArchitecturePlaybook(PLAYBOOK_PATH);
    expect(Object.keys(playbook.archetypes)).toHaveLength(10);
    for (const id of ARCHETYPE_IDS) {
      expect(playbook.archetypes[id]?.preset).toBeTruthy();
      expect(playbook.archetypes[id]?.phases?.['1']?.length).toBeGreaterThan(0);
    }
  });
});

describe('scoreArchetypes on fixture repo shapes', () => {
  it('scores prototype-spike for an empty/tiny tree', () => {
    const root = mkTempDir('ark-rec-empty-');
    writeJson(path.join(root, 'package.json'), { name: 'empty', version: '0.0.0' });
    expect(recommendTopArchetype(root)).toBe('prototype-spike');
  });

  it('scores multi-app-workspace when workspaces are declared', () => {
    const root = mkTempDir('ark-rec-mono-');
    writeJson(path.join(root, 'package.json'), {
      name: 'mono',
      workspaces: ['packages/*'],
    });
    writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - packages/*\n'
    );
    writeFile(path.join(root, 'packages', 'api', 'src', 'index.ts'), 'export {};\n');
    expect(recommendTopArchetype(root)).toBe('multi-app-workspace');
  });

  it('scores frontend-surface for UI-only repos', () => {
    const root = mkTempDir('ark-rec-ui-');
    writeJson(path.join(root, 'package.json'), { name: 'ui-app', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'components', 'Home.tsx'), 'export const Home = () => null;\n');
    writeFile(path.join(root, 'src', 'pages', 'index.tsx'), 'export default function Page() { return null; }\n');
    expect(recommendTopArchetype(root)).toBe('frontend-surface');
  });

  it('scores api-backend for API + persistence without a heavy UI', () => {
    const root = mkTempDir('ark-rec-api-');
    writeJson(path.join(root, 'package.json'), { name: 'api', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'routes', 'orders.ts'), 'export function list() {}\n');
    writeFile(path.join(root, 'src', 'repositories', 'order-repo.ts'), 'export class OrderRepo {}\n');
    writeFile(path.join(root, 'src', 'application', 'place-order.ts'), 'export function place() {}\n');
    expect(recommendTopArchetype(root)).toBe('api-backend');
  });

  it('scores cli-utility when package.json declares bin', () => {
    const root = mkTempDir('ark-rec-cli-');
    writeJson(path.join(root, 'package.json'), {
      name: 'tool',
      version: '0.0.0',
      bin: { mytool: 'dist/cli.js' },
    });
    writeFile(path.join(root, 'src', 'cli.ts'), 'console.log("hi");\n');
    expect(recommendTopArchetype(root)).toBe('cli-utility');
  });

  it('scores worker-pipeline for job directories without UI', () => {
    const root = mkTempDir('ark-rec-jobs-');
    writeJson(path.join(root, 'package.json'), { name: 'worker', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'jobs', 'send-email.ts'), 'export async function run() {}\n');
    writeFile(path.join(root, 'src', 'application', 'enqueue.ts'), 'export function enqueue() {}\n');
    expect(recommendTopArchetype(root)).toBe('worker-pipeline');
  });
});

describe('ark-check --recommend CLI', () => {
  it('emits JSON with archetype, preset, confidence, phases, and runnerUp', () => {
    const root = mkTempDir('ark-rec-cli-json-');
    writeJson(path.join(root, 'package.json'), { name: 'api', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'routes', 'health.ts'), 'export function ok() { return true; }\n');
    writeFile(path.join(root, 'src', 'repositories', 'user.ts'), 'export const users = [];\n');

    const result = runRecommendJson(root);
    expect(result.ok).toBe(true);
    expect(ARCHETYPE_IDS.has(result.archetype)).toBe(true);
    expect(['hexagonal', 'layered', 'feature-sliced', 'monorepo']).toContain(result.preset);
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.adoptInOrder.phase1.length).toBeGreaterThan(0);
    expect(result.runnerUp?.id).toBeTruthy();
    expect(result.why.length).toBeGreaterThan(0);
  });

  it('prints human-readable plan with phase-1 layers', () => {
    const stdout = execFileSync('node', [ARK_CHECK, '--root', process.cwd(), '--recommend'], {
      encoding: 'utf8',
    });
    expect(stdout).toMatch(/Archetype:/);
    expect(stdout).toMatch(/Phase 1 layers/);
    expect(stdout).toMatch(/DomainModel|ApplicationOrchestration|PresentationAdapters|PersistenceAdapters|prototype-spike/);
  });
});

describe('buildArchitectureRecommendation', () => {
  it('maps crud-product when UI and persistence coexist', () => {
    const root = mkTempDir('ark-rec-crud-');
    writeJson(path.join(root, 'package.json'), { name: 'crud', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'domain', 'order.ts'), 'export type Order = { id: string };\n');
    writeFile(path.join(root, 'src', 'components', 'List.tsx'), 'export const List = () => null;\n');
    writeFile(path.join(root, 'src', 'persistence', 'db.ts'), 'export const db = {};\n');

    const rec = buildArchitectureRecommendation(root, { playbookPath: PLAYBOOK_PATH });
    expect(rec.archetype).toBe('crud-product');
    expect(rec.preset).toBe('hexagonal');
    expect(rec.adoptInOrder.phase1).toContain('DomainModel');
    expect(rec.firstCommand).toContain('ark init');
  });
});