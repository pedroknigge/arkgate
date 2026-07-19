import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const SCENARIOS = new Set([
  'clock-boundary',
  'repository-port',
  'presentation-mapper',
  'cycle-extraction',
]);

function slug(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

function assertTask(task) {
  if (!task || typeof task !== 'object') throw new Error('task is required');
  if (!/^[a-z0-9][a-z0-9-]+$/.test(task.id ?? '')) throw new Error('task.id is invalid');
  if (!SCENARIOS.has(task.scenario)) throw new Error(`unknown scenario: ${task.scenario}`);
  if (!/^[A-Z][A-Za-z0-9]+$/.test(task.noun ?? '')) throw new Error('task.noun is invalid');
}

function fixtureFiles(task) {
  const noun = task.noun;
  const lower = slug(noun);
  const base = `z08-task/${task.id}`;
  if (task.scenario === 'clock-boundary') {
    return {
      [`${base}/application/${lower}-status.mts`]: `import { SystemClock } from '../infrastructure/system-clock.mjs';

export class ${noun}Status {
  readonly #clock = new SystemClock();

  isExpired(expiresAt: Date): boolean {
    return this.#clock.now().getTime() >= expiresAt.getTime();
  }
}
`,
      [`${base}/infrastructure/system-clock.mts`]: `export class SystemClock {
  now(): Date {
    return new Date();
  }
}
`,
    };
  }
  if (task.scenario === 'repository-port') {
    return {
      [`${base}/application/find-${lower}.mts`]: `import { Json${noun}Repository } from '../infrastructure/json-${lower}-repository.mjs';

export interface ${noun}Record {
  id: string;
  label: string;
}

export class Find${noun} {
  readonly #repository = new Json${noun}Repository();

  async execute(id: string): Promise<${noun}Record | null> {
    return this.#repository.findById(id);
  }
}
`,
      [`${base}/infrastructure/json-${lower}-repository.mts`]: `import type { ${noun}Record } from '../application/find-${lower}.mjs';

export class Json${noun}Repository {
  readonly #records = new Map<string, ${noun}Record>();

  async findById(id: string): Promise<${noun}Record | null> {
    return this.#records.get(id) ?? null;
  }
}
`,
    };
  }
  if (task.scenario === 'presentation-mapper') {
    return {
      [`${base}/domain/${lower}.mts`]: `import type { ${noun}Response } from '../presentation/${lower}-response.mjs';

export class ${noun} {
  constructor(readonly id: string, readonly label: string) {}

  toResponse(): ${noun}Response {
    return { id: this.id, displayLabel: this.label.trim() };
  }
}
`,
      [`${base}/presentation/${lower}-response.mts`]: `export interface ${noun}Response {
  id: string;
  displayLabel: string;
}
`,
    };
  }
  return {
    [`${base}/application/calculate-${lower}.mts`]: `import { discountFor } from './${lower}-discount.mjs';

export type ${noun}Tier = 'standard' | 'preferred';
export const ${noun.toUpperCase()}_SERVICE_FEE = 5;

export function calculate${noun}(amount: number, tier: ${noun}Tier): number {
  return amount - discountFor(amount, tier) + ${noun.toUpperCase()}_SERVICE_FEE;
}
`,
    [`${base}/application/${lower}-discount.mts`]: `import {
  ${noun.toUpperCase()}_SERVICE_FEE,
  type ${noun}Tier,
} from './calculate-${lower}.mjs';

export function discountFor(amount: number, tier: ${noun}Tier): number {
  void ${noun.toUpperCase()}_SERVICE_FEE;
  return tier === 'preferred' ? amount * 0.1 : 0;
}
`,
  };
}

function oracleFiles(task) {
  const noun = task.noun;
  const lower = slug(noun);
  const base = `z08-task/${task.id}`;
  if (task.scenario === 'clock-boundary') {
    return {
      [`${base}/domain/clock.mts`]: `export interface Clock {
  now(): Date;
}
`,
      [`${base}/application/${lower}-status.mts`]: `import type { Clock } from '../domain/clock.mjs';

export class ${noun}Status {
  constructor(readonly clock: Clock) {}

  isExpired(expiresAt: Date): boolean {
    return this.clock.now().getTime() >= expiresAt.getTime();
  }
}
`,
      [`${base}/infrastructure/system-clock.mts`]: `import type { Clock } from '../domain/clock.mjs';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
`,
    };
  }
  if (task.scenario === 'repository-port') {
    return {
      [`${base}/domain/${lower}-repository.mts`]: `export interface ${noun}Record {
  id: string;
  label: string;
}

export interface ${noun}Repository {
  findById(id: string): Promise<${noun}Record | null>;
}
`,
      [`${base}/application/find-${lower}.mts`]: `import type {
  ${noun}Record,
  ${noun}Repository,
} from '../domain/${lower}-repository.mjs';

export class Find${noun} {
  constructor(readonly repository: ${noun}Repository) {}

  async execute(id: string): Promise<${noun}Record | null> {
    return this.repository.findById(id);
  }
}
`,
      [`${base}/infrastructure/json-${lower}-repository.mts`]: `import type {
  ${noun}Record,
  ${noun}Repository,
} from '../domain/${lower}-repository.mjs';

export class Json${noun}Repository implements ${noun}Repository {
  readonly #records = new Map<string, ${noun}Record>();

  async findById(id: string): Promise<${noun}Record | null> {
    return this.#records.get(id) ?? null;
  }
}
`,
    };
  }
  if (task.scenario === 'presentation-mapper') {
    return {
      [`${base}/domain/${lower}.mts`]: `export interface ${noun}Snapshot {
  id: string;
  label: string;
}

export class ${noun} {
  constructor(readonly id: string, readonly label: string) {}

  snapshot(): ${noun}Snapshot {
    return { id: this.id, label: this.label };
  }
}
`,
      [`${base}/presentation/${lower}-response.mts`]: `import type { ${noun}Snapshot } from '../domain/${lower}.mjs';

export interface ${noun}Response {
  id: string;
  displayLabel: string;
}

export class ${noun}Presenter {
  static toResponse(value: ${noun}Snapshot): ${noun}Response {
    return { id: value.id, displayLabel: value.label.trim() };
  }
}
`,
    };
  }
  return {
    [`${base}/domain/${lower}-pricing.mts`]: `export type ${noun}Tier = 'standard' | 'preferred';
export const ${noun.toUpperCase()}_SERVICE_FEE = 5;

export function discountFor(amount: number, tier: ${noun}Tier): number {
  return tier === 'preferred' ? amount * 0.1 + ${noun.toUpperCase()}_SERVICE_FEE : 0;
}
`,
    [`${base}/application/${lower}-discount.mts`]: `export { discountFor } from '../domain/${lower}-pricing.mjs';
`,
    [`${base}/application/calculate-${lower}.mts`]: `import {
  discountFor,
  ${noun.toUpperCase()}_SERVICE_FEE,
  type ${noun}Tier,
} from '../domain/${lower}-pricing.mjs';

export function calculate${noun}(amount: number, tier: ${noun}Tier): number {
  return amount - discountFor(amount, tier) + ${noun.toUpperCase()}_SERVICE_FEE;
}
`,
  };
}

export function taskPrompt(task) {
  assertTask(task);
  const noun = task.noun;
  const base = `z08-task/${task.id}`;
  const common = [
    `Work only inside ${base}.`,
    'Do not edit package metadata, tests, TypeScript configuration, architecture configuration, agent instructions, or CI.',
    'Preserve the existing public behavior and exports unless the requirement below names the replacement API.',
    'Finish with production code; do not add test-only branches or weaken checks.',
  ];
  const requirement = {
    'clock-boundary': `Refactor ${noun}Status so its constructor accepts a replaceable Clock with now(): Date. Expiration must be true at the exact deadline. Keep SystemClock as the production adapter, and remove the application layer's dependency on concrete infrastructure.`,
    'repository-port': `Refactor Find${noun} so its constructor accepts a ${noun}Repository port and execute(id) remains asynchronous. Keep Json${noun}Repository as an adapter, but remove all application-layer imports of concrete infrastructure.`,
    'presentation-mapper': `Remove the domain model's HTTP response dependency. ${noun} must expose snapshot(), and ${noun}Presenter.toResponse(snapshot) must produce { id, displayLabel } with a trimmed label.`,
    'cycle-extraction': `Remove the circular dependency between calculate-${slug(noun)} and ${slug(noun)}-discount by extracting the pure pricing policy to the domain layer. Preserve calculate${noun}(amount, tier): standard returns amount + 5; preferred returns amount * 0.9.`,
  }[task.scenario];
  return [`Implement the following focused change in this pinned TypeScript repository:`, '', requirement, '', ...common].join('\n');
}

export function architectureConfig(task) {
  assertTask(task);
  const base = `z08-task/${task.id}`;
  return {
    schemaVersion: '1.0',
    include: [base],
    safety: { maxTsSuppressions: 0, maxAnyCasts: 0, allowInMemory: true },
    layers: [
      {
        name: 'DomainModel',
        patterns: [`${base}/domain/**`],
        forbiddenGlobals: ['fetch', 'process', 'Date.now', 'Math.random'],
        optional: true,
      },
      { name: 'Application', patterns: [`${base}/application/**`], optional: true },
      { name: 'Infrastructure', patterns: [`${base}/infrastructure/**`], optional: true },
      { name: 'Presentation', patterns: [`${base}/presentation/**`], optional: true },
    ],
    rules: [
      { from: 'DomainModel', to: 'Application', allowed: false },
      { from: 'DomainModel', to: 'Infrastructure', allowed: false },
      { from: 'DomainModel', to: 'Presentation', allowed: false },
      { from: 'Application', to: 'Infrastructure', allowed: false },
      { from: 'Application', to: 'Presentation', allowed: false },
      { from: 'Infrastructure', to: 'Application', allowed: false },
      { from: 'Presentation', to: 'Infrastructure', allowed: false },
    ],
  };
}

export function materializedTaskFiles(task, variant = 'fixture') {
  assertTask(task);
  if (variant !== 'fixture' && variant !== 'oracle') throw new Error('variant must be fixture or oracle');
  return variant === 'fixture' ? fixtureFiles(task) : oracleFiles(task);
}

export function writeTaskFiles(root, task, variant = 'fixture') {
  const taskRoot = path.join(root, 'z08-task', task.id);
  fs.rmSync(taskRoot, { recursive: true, force: true });
  for (const [relative, content] of Object.entries(materializedTaskFiles(task, variant))) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

export async function runTaskAcceptance(task, compiledRoot) {
  assertTask(task);
  const noun = task.noun;
  const lower = slug(noun);
  const base = path.join(compiledRoot, 'z08-task', task.id);
  const load = async (relative) => import(`${pathToFileURL(path.join(base, relative)).href}?v=${Date.now()}`);
  if (task.scenario === 'clock-boundary') {
    const module = await load(`application/${lower}-status.mjs`);
    const now = new Date('2035-06-01T00:00:00.000Z');
    const subject = new module[`${noun}Status`]({ now: () => now });
    if (!subject.isExpired(now) || subject.isExpired(new Date(now.getTime() + 1))) {
      throw new Error('clock-boundary acceptance failed');
    }
    return;
  }
  if (task.scenario === 'repository-port') {
    const module = await load(`application/find-${lower}.mjs`);
    const expected = { id: 'held-out', label: noun };
    const subject = new module[`Find${noun}`]({
      findById: async (id) => (id === expected.id ? expected : null),
    });
    const actual = await subject.execute(expected.id);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error('repository-port acceptance failed');
    return;
  }
  if (task.scenario === 'presentation-mapper') {
    const domain = await load(`domain/${lower}.mjs`);
    const presentation = await load(`presentation/${lower}-response.mjs`);
    const entity = new domain[noun]('held-out', `  ${noun}  `);
    const actual = presentation[`${noun}Presenter`].toResponse(entity.snapshot());
    if (JSON.stringify(actual) !== JSON.stringify({ id: 'held-out', displayLabel: noun })) {
      throw new Error('presentation-mapper acceptance failed');
    }
    return;
  }
  const module = await load(`application/calculate-${lower}.mjs`);
  if (module[`calculate${noun}`](100, 'standard') !== 105) throw new Error('cycle standard acceptance failed');
  if (module[`calculate${noun}`](100, 'preferred') !== 90) throw new Error('cycle preferred acceptance failed');
}
