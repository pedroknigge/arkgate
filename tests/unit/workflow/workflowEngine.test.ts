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

  it('Q8: compensation failure is audited and does not mask the original error', async () => {
    const audit = createAuditTrail();
    const engine = createWorkflowEngine(createEventBus(), { auditTrail: audit });
    engine.register({
      name: 'CompFail',
      steps: [
        {
          name: 'ok',
          execute: () => ({ ok: true }),
          compensate: async () => {
            throw new Error('comp-boom');
          },
        },
        {
          name: 'fail',
          execute: () => {
            throw new Error('step-boom');
          },
        },
      ],
    });
    await expect(engine.start('CompFail', {})).rejects.toThrow('step-boom');
    const snap = (await engine.list('CompFail'))[0];
    expect(snap.status).toBe('failed');
    const compFails = await audit.query({ type: 'workflow.step.failed' });
    expect(
      compFails.some(
        (e) =>
          (e.details as { compensation?: boolean; error?: string })?.compensation === true &&
          String((e.details as { error?: string })?.error || '').includes('comp-boom')
      )
    ).toBe(true);
  });

  it('Q8: cancellation-ignoring step still fails timeout and ends failed', async () => {
    const engine = createWorkflowEngine(createEventBus());
    const effects: string[] = [];
    engine.register({
      name: 'IgnoreCancel',
      steps: [
        {
          name: 'stubborn',
          timeoutMs: 15,
          execute: () =>
            new Promise<void>((resolve) => {
              // Deliberately ignore AbortSignal — gate still times out the step.
              setTimeout(() => {
                effects.push('ran-late');
                resolve();
              }, 80);
            }),
        },
      ],
    });
    await expect(engine.start('IgnoreCancel', {})).rejects.toThrow(/timed out/i);
    const snap = (await engine.list('IgnoreCancel'))[0];
    expect(snap.status).toBe('failed');
    expect(snap.failedStep).toBe('stubborn');
    await new Promise((r) => setTimeout(r, 100));
    // Late work may still run if it ignored abort; status remains failed (observable terminal).
    expect(snap.status).toBe('failed');
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
