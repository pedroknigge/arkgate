/**
 * Y02 — deterministic hollow-persistence advisory.
 *
 * Persistence candidates are selected before the bounded content scan so a
 * large application prefix cannot hide the field-calibrated 206-file shape.
 */
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildPatternBetsFromSmells,
  detectDesignSmells,
} from '../../../bin/lib/design-smells.mjs';
import { runDoctor } from '../../../bin/lib/doctor-plan.mjs';

const roots: string[] = [];

function project(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-y02-hollow-persistence-'));
  roots.push(root);
  return root;
}

function write(root: string, rel: string, body: string): string {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body);
  return file;
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const CONFIG = {
  include: ['src'],
  layers: [
    { name: 'DomainModel', patterns: ['src/domain/**'] },
    { name: 'ApplicationOrchestration', patterns: ['src/application/**'] },
    { name: 'PersistenceAdapters', patterns: ['src/storage/**'] },
    {
      name: 'OuterAdapters',
      patterns: [
        'src/repositories/**',
        'src/infra/db/**',
        'src/infra/data/**',
        'src/adapters/persistence/**',
      ],
    },
    { name: 'Infrastructure', patterns: ['src/infrastructure/**'] },
  ],
  rules: [
    { from: 'DomainModel', to: 'ApplicationOrchestration', allowed: false },
    { from: 'DomainModel', to: 'PersistenceAdapters', allowed: false },
    { from: 'DomainModel', to: 'OuterAdapters', allowed: false },
    { from: 'DomainModel', to: 'Infrastructure', allowed: false },
  ],
};

function hollow(smells: ReturnType<typeof detectDesignSmells>) {
  return smells.find((smell) => smell.id === 'handler-in-persistence');
}

function doctorOutput(root: string, files: string[], asJson: boolean): string {
  const logs: string[] = [];
  const original = console.log;
  console.log = (...values: unknown[]) => logs.push(values.map(String).join(' '));
  try {
    runDoctor(root, CONFIG, files, CONFIG.rules, [], asJson, { completeness: 'complete' });
  } finally {
    console.log = original;
  }
  return logs.join('\n');
}

describe('Y02 hollow-persistence detection', () => {
  it('sees framework HTTP imports, defineRoute calls, and handler bodies only in Persistence roles/paths', () => {
    const root = project();
    const files = [
      // Role-only: storage is not a persistence-looking path, but the layer is.
      write(
        root,
        'src/storage/framework-http.ts',
        `import type { NextRequest } from 'next/server';\nexport type Request = NextRequest;\n`
      ),
      // Path-only: OuterAdapters is deliberately generic.
      write(
        root,
        'src/infra/db/project-route.ts',
        `export const projectRoute = defineRoute<Context<{ id: string; slug: string }>>({}, async (ctx) => ctx);\n`
      ),
      write(
        root,
        'src/infra/data/multiline-route.ts',
        `export const multilineRoute = defineRoute<\n  Context<{ id: string; slug: string }>\n>({}, async (ctx) => ctx);\n`
      ),
      write(
        root,
        'src/adapters/persistence/project-handler.ts',
        `export async function POST() { return { ok: true }; }\n`
      ),
      write(root, 'src/repositories/project-data.ts', `export const projectTable = 'projects';\n`),
      // A generic Infrastructure role is not synonymous with persistence.
      write(
        root,
        'src/infrastructure/http-adapter.ts',
        `import { NextResponse } from 'next/server';\nexport const GET = defineRoute({}, () => NextResponse.json({}));\n`
      ),
    ];

    const smell = hollow(detectDesignSmells(root, CONFIG, files, null));
    expect(smell).toBeTruthy();
    expect(smell!.evidence).toEqual([
      'src/adapters/persistence/project-handler.ts',
      'src/infra/data/multiline-route.ts',
      'src/infra/db/project-route.ts',
      'src/storage/framework-http.ts',
    ]);
    expect(smell!.evidence).not.toContain('src/repositories/project-data.ts');
    expect(smell!.evidence).not.toContain('src/infrastructure/http-adapter.ts');
    expect(smell!.outcome).toMatch(/HTTP|route/i);
  });

  it('ignores obvious comments, strings, templates, and defineRoute declarations', () => {
    const root = project();
    const files = [
      write(
        root,
        'src/repositories/examples.ts',
        `/*\nimport type { NextRequest } from 'next/server';\ndefineRoute<Example>({});\n*/\nconst importExample = "import type { NextRequest } from 'next/server'";\nconst routeExample = 'defineRoute<Example>({})';\nconst templateExample = \`defineRoute<Example>({})\`;\nexport function defineRoute<T extends { id: string; slug: string }>(input: T): T { return input; }\nexport const table = 'projects';\n`
      ),
    ];

    expect(hollow(detectDesignSmells(root, CONFIG, files, null))).toBeUndefined();
  });

  it('does not lose the field-calibrated 206 positives behind more than 800 unrelated files', () => {
    const root = project();
    const noise = Array.from({ length: 805 }, (_, index) =>
      write(
        root,
        `src/application/noise-${String(index).padStart(4, '0')}.ts`,
        `export const noise${index} = ${index};\n`
      )
    );
    const positives = Array.from({ length: 204 }, (_, index) =>
      write(
        root,
        `src/repositories/project-${String(index).padStart(3, '0')}.ts`,
        `import { NextResponse } from 'next/server';\nexport const response${index} = NextResponse.json({ id: ${index} });\n`
      )
    );
    positives.push(
      write(
        root,
        'src/infra/data/project-route.ts',
        `export const projectRoute = defineRoute<ProjectContext<{ id: string }>>({}, async (ctx) => ctx);\n`
      ),
      write(
        root,
        'src/adapters/persistence/project-handler.ts',
        `export const POST = async () => ({ ok: true });\n`
      )
    );
    const negatives = [
      write(root, 'src/repositories/project-data.ts', `export const projectTable = 'projects';\n`),
      write(
        root,
        'src/infrastructure/http.ts',
        `import { NextResponse } from 'next/server';\nexport const response = NextResponse.json({});\n`
      ),
    ];
    const files = [...noise, ...positives, ...negatives];

    const forward = hollow(detectDesignSmells(root, CONFIG, files, null));
    const reversed = hollow(detectDesignSmells(root, CONFIG, [...files].reverse(), null));
    expect(forward).toBeTruthy();
    expect(forward!.message).toMatch(/206 file\(s\)/);
    expect(forward!.evidence).toHaveLength(12);
    expect(forward!.evidence).toEqual([...forward!.evidence].sort());
    expect(reversed).toEqual(forward);

    const bet = buildPatternBetsFromSmells([forward!])[0];
    expect(bet.smellId).toBe('handler-in-persistence');
    expect(bet.neverMechanicalSafe).toBe(true);
    expect(bet.class).toBe('judgment');
    expect(bet.successSignal).toMatch(/HTTP|route-definition/i);
  });

  it('keeps the Persistence content scan bounded and announces uninspected candidates', () => {
    const root = project();
    const files = Array.from({ length: 805 }, (_, index) =>
      write(
        root,
        `src/repositories/route-${String(index).padStart(4, '0')}.ts`,
        `export async function GET() { return ${index}; }\n`
      )
    );

    const smell = hollow(detectDesignSmells(root, CONFIG, files.reverse(), null));
    expect(smell).toBeTruthy();
    expect(smell!.message).toMatch(/800 file\(s\)/);
    expect(smell!.message).toMatch(/5 more Persistence candidate/i);
    expect(smell!.evidence).toHaveLength(12);
    expect(smell!.evidence).toEqual([...smell!.evidence].sort());
  });

  it('documents that positives after 800 sorted clean candidates remain uninspected', () => {
    const root = project();
    const clean = Array.from({ length: 800 }, (_, index) =>
      write(
        root,
        `src/repositories/a-clean-${String(index).padStart(4, '0')}.ts`,
        `export const table${index} = 'projects';\n`
      )
    );
    const afterCap = Array.from({ length: 5 }, (_, index) =>
      write(
        root,
        `src/repositories/z-route-${String(index).padStart(4, '0')}.ts`,
        `import type { NextRequest } from 'next/server';\nexport type Request${index} = NextRequest;\n`
      )
    );

    // The detector deliberately keeps a bounded, deterministic envelope. No
    // smell here means only that the first 800 sorted candidates were clean.
    expect(hollow(detectDesignSmells(root, CONFIG, [...afterCap, ...clean], null))).toBeUndefined();
  });

  it('surfaces outcome-first doctor honesty and routes to the existing one-pilot loop', () => {
    const root = project();
    const files = [
      write(root, 'src/domain/project.ts', `export type ProjectId = string;\n`),
      write(
        root,
        'src/storage/project-http.ts',
        `import { NextResponse } from 'next/server';\nexport const response = NextResponse.json({ ok: true });\n`
      ),
    ];

    const payload = JSON.parse(doctorOutput(root, files, true));
    const smell = payload.doctor.designSmells.find(
      (entry: { id: string }) => entry.id === 'handler-in-persistence'
    );
    expect(smell.outcome).toMatch(/HTTP|route/i);
    expect(payload.doctor.designFitness.designWeak).toBe(true);
    expect(payload.doctor.violations.active).toBe(0);
    expect(payload.doctor.pilotLoop.nextPilot.smellId).toBe('handler-in-persistence');
    expect(payload.doctor.pilotLoop.nextPilot.neverMechanicalSafe).toBe(true);

    const human = doctorOutput(root, files, false);
    expect(human).toMatch(/\[handler-in-persistence\]/);
    expect(human).toMatch(/HTTP|route/i);
    expect(human).toMatch(/Next pilot \(one at a time\)/i);
  });
});
