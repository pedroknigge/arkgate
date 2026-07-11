import { describe, expect, it, vi } from 'vitest';
import {
  createAuditTrail,
  createEventBus,
  createWorkflowEngine,
  defineIntent,
  InMemoryWorkflowStore,
  type WorkflowSnapshot,
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
    expect(
      (await audit.query({ type: 'workflow.step.completed' })).map(
        (record) => record.details
      )
    ).toEqual([
      { step: 'reserve', attempt: 2 },
      { step: 'capture', attempt: 1 },
    ]);
  });

  it('does not retry a successful effect when step completion audit fails', async () => {
    const audit = createAuditTrail({
      store: {
        append: (record) => {
          if (record.type === 'workflow.step.completed') {
            throw new Error('audit unavailable');
          }
        },
        query: () => [],
        clear: () => undefined,
      },
    });
    const engine = createWorkflowEngine(createEventBus(), { auditTrail: audit });
    let executions = 0;
    let compensations = 0;

    engine.register({
      name: 'AuditFailureAfterEffect',
      steps: [
        {
          name: 'charge',
          retry: { attempts: 2 },
          execute: () => {
            executions += 1;
            return { charged: true };
          },
          compensate: () => {
            compensations += 1;
          },
        },
      ],
    });

    await expect(engine.start('AuditFailureAfterEffect', {})).rejects.toThrow(
      'audit unavailable'
    );
    const snapshot = (await engine.list('AuditFailureAfterEffect'))[0];

    expect(executions).toBe(1);
    expect(compensations).toBe(1);
    expect(snapshot.completedSteps).toEqual(['charge']);
    expect(snapshot.attempts.charge).toBe(1);
    expect(snapshot).toMatchObject({ status: 'failed', error: 'audit unavailable' });
  });

  it('does not repeat completed effects when workflow completion audit fails', async () => {
    const audit = createAuditTrail({
      store: {
        append: (record) => {
          if (record.type === 'workflow.completed') {
            throw new Error('completion audit unavailable');
          }
        },
        query: () => [],
        clear: () => undefined,
      },
    });
    const engine = createWorkflowEngine(createEventBus(), { auditTrail: audit });
    let executions = 0;
    let compensations = 0;

    engine.register({
      name: 'CompletionAuditFailure',
      steps: [
        {
          name: 'charge',
          retry: { attempts: 2 },
          execute: () => {
            executions += 1;
          },
          compensate: () => {
            compensations += 1;
          },
        },
      ],
    });

    await expect(engine.start('CompletionAuditFailure', {})).rejects.toThrow(
      'completion audit unavailable'
    );
    const snapshot = (await engine.list('CompletionAuditFailure'))[0];

    expect(executions).toBe(1);
    expect(compensations).toBe(1);
    expect(snapshot.completedSteps).toEqual(['charge']);
    expect(snapshot).toMatchObject({ status: 'failed', error: 'completion audit unavailable' });
  });

  it('does not retry a successful effect when post-effect persistence fails', async () => {
    const store = new (class extends InMemoryWorkflowStore {
      private failCompletionSave = true;

      override save<P extends Record<string, unknown>>(
        snapshot: WorkflowSnapshot<P>
      ): void {
        if (
          this.failCompletionSave &&
          snapshot.status === 'running' &&
          snapshot.currentStep === undefined &&
          snapshot.completedSteps.includes('charge')
        ) {
          this.failCompletionSave = false;
          throw new Error('workflow store unavailable');
        }
        super.save(snapshot);
      }
    })();
    const engine = createWorkflowEngine(createEventBus(), { store });
    let executions = 0;
    let compensations = 0;

    engine.register({
      name: 'PersistenceFailureAfterEffect',
      steps: [
        {
          name: 'charge',
          retry: { attempts: 2 },
          execute: () => {
            executions += 1;
          },
          compensate: () => {
            compensations += 1;
          },
        },
      ],
    });

    await expect(engine.start('PersistenceFailureAfterEffect', {})).rejects.toThrow(
      'workflow store unavailable'
    );
    const snapshot = (await engine.list('PersistenceFailureAfterEffect'))[0];

    expect(executions).toBe(1);
    expect(compensations).toBe(1);
    expect(snapshot.completedSteps).toEqual(['charge']);
    expect(snapshot.attempts.charge).toBe(1);
    expect(snapshot).toMatchObject({
      status: 'failed',
      error: 'workflow store unavailable',
    });
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

  it('rejects duplicate workflow definitions and unknown workflow starts', async () => {
    const engine = createWorkflowEngine(createEventBus());
    const definition = { name: 'UniqueWorkflow', steps: [] };

    engine.register(definition);

    expect(() => engine.register(definition)).toThrow(
      'Workflow "UniqueWorkflow" is already registered.'
    );
    await expect(engine.start('MissingWorkflow', {})).rejects.toThrow(
      'Workflow "MissingWorkflow" is not registered.'
    );
    expect(await engine.get('missing-id')).toBeUndefined();
    expect(await engine.list('MissingWorkflow')).toEqual([]);
  });

  it('starts a registered workflow from its event trigger', async () => {
    const StartRequested = defineIntent<
      'Domain.Workflow.StartRequested',
      { value: number }
    >('Domain.Workflow.StartRequested');
    const bus = createEventBus();
    const engine = createWorkflowEngine(bus);

    engine.register<{ value: number; doubled?: number }>({
      name: 'EventTriggeredWorkflow',
      startOn: {
        intent: StartRequested.name,
        mapEventToPayload: (event) => ({
          value: (event.payload as { value: number }).value,
        }),
      },
      steps: [
        {
          name: 'double',
          execute: (payload) => ({ doubled: payload.value * 2 }),
        },
      ],
    });

    await bus.publish(StartRequested({ value: 6 }));

    expect(await engine.list('EventTriggeredWorkflow')).toMatchObject([
      {
        status: 'completed',
        context: { value: 6, doubled: 12 },
        completedSteps: ['double'],
      },
    ]);
  });

  it('uses the default retry delay when a step has no local retry policy', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const engine = createWorkflowEngine(createEventBus(), {
      defaultRetry: { attempts: 2, delayMs: 5 },
    });
    let executions = 0;

    engine.register({
      name: 'DefaultRetryWorkflow',
      steps: [
        {
          name: 'eventually-succeeds',
          execute: () => {
            executions += 1;
            if (executions === 1) throw new Error('temporary');
          },
        },
      ],
    });

    try {
      const snapshot = await engine.start('DefaultRetryWorkflow', {});
      expect(executions).toBe(2);
      expect(snapshot.attempts['eventually-succeeds']).toBe(2);
      expect(timer).toHaveBeenCalledWith(expect.any(Function), 5);
    } finally {
      timer.mockRestore();
    }
  });

  it('does not schedule a retry delay when the policy omits delayMs', async () => {
    const timer = vi.spyOn(globalThis, 'setTimeout');
    const engine = createWorkflowEngine(createEventBus(), {
      defaultRetry: { attempts: 2 },
    });
    let executions = 0;

    engine.register({
      name: 'ImmediateRetryWorkflow',
      steps: [
        {
          name: 'eventually-succeeds',
          execute: () => {
            executions += 1;
            if (executions === 1) throw new Error('temporary');
          },
        },
      ],
    });

    try {
      await engine.start('ImmediateRetryWorkflow', {});
      expect(executions).toBe(2);
      expect(timer).not.toHaveBeenCalled();
    } finally {
      timer.mockRestore();
    }
  });

  it('records non-Error failures and skips completed steps without compensation', async () => {
    const audit = createAuditTrail();
    const engine = createWorkflowEngine(createEventBus(), { auditTrail: audit });

    engine.register({
      name: 'StringFailureWorkflow',
      steps: [
        { name: 'completed-without-compensation', execute: () => undefined },
        {
          name: 'fails-with-a-string',
          execute: () => {
            throw 'terminal string failure';
          },
        },
      ],
    });

    await expect(engine.start('StringFailureWorkflow', {})).rejects.toBe(
      'terminal string failure'
    );
    expect((await engine.list('StringFailureWorkflow'))[0]).toMatchObject({
      status: 'failed',
      error: 'terminal string failure',
      completedSteps: ['completed-without-compensation'],
      failedStep: 'fails-with-a-string',
    });
    expect(
      (await audit.query({ type: 'workflow.step.failed' })).map(
        (record) => record.details
      )
    ).toEqual([
      {
        step: 'fails-with-a-string',
        attempt: 1,
        error: 'terminal string failure',
      },
    ]);
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
