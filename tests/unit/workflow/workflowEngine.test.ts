import { describe, expect, it } from 'vitest';
import {
  createAuditTrail,
  createEventBus,
  createWorkflowEngine,
} from '../../../src/index';

describe('WorkflowEngine', () => {
  it('persists snapshots, retries failed steps, and audits progress', async () => {
    const audit = createAuditTrail();
    const bus = createEventBus();
    const engine = createWorkflowEngine(bus, { auditTrail: audit });
    let attempts = 0;

    engine.register({
      name: 'OrderFulfillment',
      steps: [
        {
          name: 'reserve',
          retry: { attempts: 2 },
          execute: () => {
            attempts += 1;
            if (attempts === 1) throw new Error('temporary');
            return { reserved: true };
          },
        },
        {
          name: 'capture',
          execute: () => ({ captured: true }),
        },
      ],
    });

    const snapshot = await engine.start('OrderFulfillment', {});

    expect(snapshot.status).toBe('completed');
    expect(snapshot.completedSteps).toEqual(['reserve', 'capture']);
    expect(snapshot.attempts.reserve).toBe(2);
    expect(await engine.get(snapshot.id)).toMatchObject({ status: 'completed' });
    expect(await audit.query({ type: 'workflow.step.completed' })).toHaveLength(2);
  });

  it('rejects duplicate step names before they can corrupt compensation order', () => {
    const engine = createWorkflowEngine(createEventBus());
    expect(() =>
      engine.register({
        name: 'DuplicateSteps',
        steps: [
          { name: 'same', execute: () => undefined },
          { name: 'same', execute: () => undefined },
        ],
      })
    ).toThrow('duplicate step name "same"');
  });

  it('aborts timed-out steps cooperatively and clears the running step', async () => {
    const engine = createWorkflowEngine(createEventBus());
    const effects: string[] = [];
    engine.register({
      name: 'TimedWorkflow',
      steps: [
        {
          name: 'slow',
          timeoutMs: 10,
          execute: (_payload, _bus, signal) =>
            new Promise<void>((resolve, reject) => {
              const timer = setTimeout(() => {
                effects.push('late');
                resolve();
              }, 60);
              signal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(signal.reason);
                },
                { once: true }
              );
            }),
        },
      ],
    });

    await expect(engine.start('TimedWorkflow', {})).rejects.toThrow('timed out');
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(effects).toEqual([]);
    expect((await engine.list('TimedWorkflow'))[0]).toMatchObject({
      status: 'failed',
      failedStep: 'slow',
      currentStep: undefined,
    });
  });
});
