/**
 * arkgate/runtime and arkgate/nestjs must share one kernel copy (tsup code
 * splitting): errors thrown by an ArkModule kernel pass `instanceof` against the
 * classes exported from arkgate/runtime, and the Nest bundle does not embed its
 * own kernel.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { withDistLock } from '../../helpers/distLock';

const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, 'package.json'));

function build() {
  withDistLock(() => {
    const result = spawnSync('npm', ['run', 'build'], { cwd: root, encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  });
}

describe('shared kernel chunk for runtime + nestjs entries', () => {
  beforeAll(build, 120_000);

  it('ArkModule kernel errors are instances of the arkgate/runtime classes', async () => {
    const runtime = requireFromRoot(path.join(root, 'dist/runtime/index.cjs'));
    const nest = requireFromRoot(path.join(root, 'dist/nestjs/index.cjs'));
    const kernel = nest.ArkModule.forRoot().providers[0].useValue;
    const OrderPlaced = kernel.registry.define('Domain.Order.Placed');
    kernel.registry.define('Application.PlaceOrder', { produces: ['Domain.Order.Placed'] });
    let caught: unknown;
    try {
      await kernel.eventBus.publish(OrderPlaced, {}, { source: 'Application.PlaceOrder' });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error | undefined)?.name).toBe('EventContractViolationError');
    expect(caught).toBeInstanceOf(runtime.EventContractViolationError);
  });

  it('the nestjs entry does not embed its own kernel copy', () => {
    for (const file of ['dist/nestjs/index.js', 'dist/nestjs/index.cjs']) {
      const source = fs.readFileSync(path.join(root, file), 'utf8');
      expect(source.length).toBeLessThan(8_000);
      expect(source).not.toContain('EventContractViolationError');
    }
  });
});
