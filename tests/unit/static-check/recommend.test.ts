import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildArchitectureRecommendation,
  collectRepoShapeSignals,
  loadArchitecturePlaybook,
  whyFromMatchedSignals,
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

type RecommendJson = {
  ok: boolean;
  archetype: string;
  preset: string;
  confidence: number;
  adoptInOrder: { phase1: string[] };
  runnerUp: { id: string };
  why: string[];
  matchedSignals: string[];
};

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

function runRecommendJson(root: string): RecommendJson {
  const stdout = execFileSync('node', [ARK_CHECK, '--root', root, '--recommend', '--json'], {
    encoding: 'utf8',
  });
  return JSON.parse(stdout) as RecommendJson;
}

function runRecommendHuman(root: string) {
  return execFileSync('node', [ARK_CHECK, '--root', root, '--recommend'], {
    encoding: 'utf8',
  });
}

type FixtureShape = {
  id: string;
  seed: (root: string) => void;
  phase1Layer?: string;
};

const FIXTURE_SHAPES: FixtureShape[] = [
  {
    id: 'prototype-spike',
    seed(root) {
      writeJson(path.join(root, 'package.json'), { name: 'empty', version: '0.0.0' });
    },
    phase1Layer: 'ApplicationOrchestration',
  },
  {
    id: 'multi-app-workspace',
    seed(root) {
      writeJson(path.join(root, 'package.json'), {
        name: 'mono',
        workspaces: ['packages/*'],
      });
      writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      writeFile(path.join(root, 'packages', 'api', 'src', 'index.ts'), 'export {};\n');
    },
    phase1Layer: 'DomainModel',
  },
  {
    id: 'frontend-surface',
    seed(root) {
      writeJson(path.join(root, 'package.json'), { name: 'ui-app', version: '0.0.0' });
      writeFile(path.join(root, 'src', 'components', 'Home.tsx'), 'export const Home = () => null;\n');
      writeFile(path.join(root, 'src', 'pages', 'index.tsx'), 'export default function Page() { return null; }\n');
    },
    phase1Layer: 'PresentationAdapters',
  },
  {
    id: 'api-backend',
    seed(root) {
      writeJson(path.join(root, 'package.json'), { name: 'api', version: '0.0.0' });
      writeFile(path.join(root, 'src', 'routes', 'orders.ts'), 'export function list() {}\n');
      writeFile(path.join(root, 'src', 'repositories', 'order-repo.ts'), 'export class OrderRepo {}\n');
      writeFile(path.join(root, 'src', 'application', 'place-order.ts'), 'export function place() {}\n');
    },
    phase1Layer: 'DomainModel',
  },
  {
    id: 'cli-utility',
    seed(root) {
      writeJson(path.join(root, 'package.json'), {
        name: 'tool',
        version: '0.0.0',
        bin: { mytool: 'dist/cli.js' },
      });
      writeFile(path.join(root, 'src', 'cli.ts'), 'console.log("hi");\n');
    },
    phase1Layer: 'ApplicationOrchestration',
  },
  {
    id: 'worker-pipeline',
    seed(root) {
      writeJson(path.join(root, 'package.json'), { name: 'worker', version: '0.0.0' });
      writeFile(path.join(root, 'src', 'jobs', 'send-email.ts'), 'export async function run() {}\n');
      writeFile(path.join(root, 'src', 'application', 'enqueue.ts'), 'export function enqueue() {}\n');
    },
    phase1Layer: 'ApplicationOrchestration',
  },
  {
    id: 'crud-product',
    seed(root) {
      writeJson(path.join(root, 'package.json'), { name: 'crud', version: '0.0.0' });
      writeFile(path.join(root, 'src', 'domain', 'order.ts'), 'export type Order = { id: string };\n');
      writeFile(path.join(root, 'src', 'components', 'List.tsx'), 'export const List = () => null;\n');
      writeFile(path.join(root, 'src', 'persistence', 'db.ts'), 'export const db = {};\n');
    },
    phase1Layer: 'DomainModel',
  },
];

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

describe('ark-check --recommend --json per fixture shape', () => {
  for (const fixture of FIXTURE_SHAPES) {
    it(`recommends ${fixture.id} for its repo shape`, () => {
      const root = mkTempDir(`ark-rec-${fixture.id}-`);
      fixture.seed(root);

      const result = runRecommendJson(root);

      expect(result.ok).toBe(true);
      expect(result.archetype).toBe(fixture.id);
      expect(ARCHETYPE_IDS.has(result.archetype)).toBe(true);
      expect(['hexagonal', 'layered', 'feature-sliced', 'monorepo']).toContain(result.preset);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
      expect(result.adoptInOrder.phase1.length).toBeGreaterThan(0);
      if (fixture.phase1Layer) {
        expect(result.adoptInOrder.phase1).toContain(fixture.phase1Layer);
      }
      expect(result.runnerUp?.id).toBeTruthy();
      expect(result.runnerUp.id).not.toBe(fixture.id);
      expect(result.matchedSignals.length).toBeGreaterThan(0);
      expect(result.why.length).toBeGreaterThan(0);
      expect(result.why.length).toBeLessThanOrEqual(result.matchedSignals.length + 2);
    });
  }
});

describe('ark-check --recommend CLI', () => {
  it('prints human-readable plan with phase-1 layers from a temp fixture', () => {
    const root = mkTempDir('ark-rec-human-');
    FIXTURE_SHAPES.find((f) => f.id === 'api-backend')!.seed(root);

    const stdout = runRecommendHuman(root);

    expect(stdout).toMatch(/Archetype: api-backend/);
    expect(stdout).toMatch(/Phase 1 layers/);
    expect(stdout).toMatch(/DomainModel/);
    expect(stdout).toMatch(/Why \(repo shape signals\):/);
  });
});

describe('whyFromMatchedSignals', () => {
  it('returns only reasons for signals that scored the winning archetype', () => {
    const rec = buildArchitectureRecommendation(
      (() => {
        const root = mkTempDir('ark-rec-why-');
        writeJson(path.join(root, 'package.json'), {
          name: 'tool',
          version: '0.0.0',
          bin: { mytool: 'dist/cli.js' },
        });
        writeFile(path.join(root, 'src', 'cli.ts'), 'export {};\n');
        return root;
      })(),
      { playbookPath: PLAYBOOK_PATH }
    );

    expect(rec.archetype).toBe('cli-utility');
    expect(rec.matchedSignals).toEqual(['cli']);
    expect(rec.why).toEqual(['package.json declares a bin entry']);
    expect(rec.why).not.toContain('API/route/controller directories present');
  });

  it('buildArchitectureRecommendation why matches whyFromMatchedSignals', () => {
    const root = mkTempDir('ark-rec-why2-');
    writeJson(path.join(root, 'package.json'), { name: 'worker', version: '0.0.0' });
    writeFile(path.join(root, 'src', 'jobs', 'run.ts'), 'export async function run() {}\n');

    const rec = buildArchitectureRecommendation(root, { playbookPath: PLAYBOOK_PATH });
    const signals = collectRepoShapeSignals(root);
    expect(rec.why).toEqual(whyFromMatchedSignals(signals, rec.matchedSignals));
  });
});

describe('collectRepoShapeSignals — JavaScript / serverless layouts', () => {
  it('counts .js/.jsx under src, lib, and api and recommends crud-product for full-stack SPA', () => {
    const root = mkTempDir('ark-rec-js-fullstack-');
    writeJson(path.join(root, 'package.json'), {
      name: 'dashboard',
      version: '0.1.0',
      dependencies: {
        react: '^19.0.0',
        '@libsql/client': '^0.17.0',
      },
    });
    writeFile(path.join(root, 'src', 'main.jsx'), 'export const App = () => null;\n');
    writeFile(path.join(root, 'api', 'dashboard-data.js'), 'export default async function handler() {}\n');
    writeFile(path.join(root, 'lib', 'turso.js'), 'export const db = {};\n');
    writeFile(path.join(root, 'lib', 'auth.js'), 'export function auth() {}\n');

    const signals = collectRepoShapeSignals(root);
    expect(signals.sourceFileCount).toBeGreaterThanOrEqual(4);
    expect(signals.tinyTree).toBe(false);
    expect(signals.ui).toBe(true);
    expect(signals.apiSurface).toBe(true);
    expect(signals.persistence).toBe(true);
    expect(signals.fullStackProduct).toBe(true);

    const rec = runRecommendJson(root);
    expect(rec.archetype).toBe('crud-product');
    expect(rec.firstCommand).toContain('init --archetype crud-product');
  });
});