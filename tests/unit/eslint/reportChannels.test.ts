/**
 * Report channels: one evaluation per file and rule, routed per finding to the blocking
 * rule id or to ark/architecture-advisory, with a tagged fallback when the advisory rule
 * is off.
 */
import { describe, expect, it } from 'vitest';
import {
  ADVISORY_FALLBACK_MESSAGE_ID,
  ADVISORY_MESSAGE_ID,
  createChannelListeners,
} from '../../../src/eslint/reportChannels';
import { reportAdapterDiagnostic, type ArkRule, type RuleContext } from '../../../src/eslint/ruleSupport';

function countingRule() {
  const counter = { creates: 0 };
  const rule: ArkRule = {
    meta: { type: 'problem', docs: { description: 'test' }, messages: { hit: '{{message}}' }, schema: [] },
    create(context) {
      counter.creates += 1;
      return {
        Identifier(node) {
          const soft = node.name === 'soft';
          reportAdapterDiagnostic(context, node, 'hit', {
            ruleId: 'LAYER_IMPORT_VIOLATION',
            file: 'src/a.ts',
            message: `found ${node.name}`,
            ...(soft ? { failsStrict: false, severity: 'warning' as const } : {}),
          }, { message: `found ${node.name}` });
        },
      };
    },
  };
  return { rule, counter };
}

function runContext() {
  return Object.freeze({ filename: '/p/src/a.ts', sourceCode: { text: '' } });
}

function ruleContext(fileContext: object, sink: Array<Record<string, unknown>>): RuleContext {
  return Object.assign(Object.create(fileContext), {
    report: (descriptor: Record<string, unknown>) => sink.push(descriptor),
  }) as RuleContext;
}

const node = (name: string) => ({ type: 'Identifier', name, loc: { start: { line: 1, column: 0 } } });

describe('report channels', () => {
  it('evaluates once per file when both channels are enabled and routes by severity', () => {
    const { rule, counter } = countingRule();
    const file = runContext();
    const blocking: Array<Record<string, unknown>> = [];
    const advisory: Array<Record<string, unknown>> = [];
    const listeners = [
      createChannelListeners(rule, ruleContext(file, blocking), 'blocking'),
      createChannelListeners(rule, ruleContext(file, advisory), 'advisory'),
    ];
    for (const n of [node('hard'), node('soft')]) {
      for (const listener of listeners) listener.Identifier?.(n);
    }
    expect(counter.creates).toBe(1);
    expect(blocking.map((r) => r.messageId)).toEqual(['hit']);
    expect(advisory.map((r) => r.messageId)).toEqual([ADVISORY_MESSAGE_ID]);
    expect(advisory[0]!.data).toEqual({ message: 'found soft', ruleId: 'LAYER_IMPORT_VIOLATION' });
  });

  it('routes correctly when the advisory rule is created first', () => {
    const { rule, counter } = countingRule();
    const file = runContext();
    const blocking: Array<Record<string, unknown>> = [];
    const advisory: Array<Record<string, unknown>> = [];
    const listeners = [
      createChannelListeners(rule, ruleContext(file, advisory), 'advisory'),
      createChannelListeners(rule, ruleContext(file, blocking), 'blocking'),
    ];
    for (const n of [node('hard'), node('soft')]) {
      for (const listener of listeners) listener.Identifier?.(n);
    }
    expect(counter.creates).toBe(1);
    expect(blocking.map((r) => r.messageId)).toEqual(['hit']);
    expect(advisory.map((r) => r.messageId)).toEqual([ADVISORY_MESSAGE_ID]);
  });

  it('falls back to the blocking rule, tagged, when the advisory rule is off', () => {
    const { rule } = countingRule();
    const blocking: Array<Record<string, unknown>> = [];
    const listener = createChannelListeners(rule, ruleContext(runContext(), blocking), 'blocking');
    listener.Identifier?.(node('soft'));
    expect(blocking.map((r) => r.messageId)).toEqual([ADVISORY_FALLBACK_MESSAGE_ID]);
  });

  it('drops blocking findings when only the advisory rule is on', () => {
    const { rule } = countingRule();
    const advisory: Array<Record<string, unknown>> = [];
    const listener = createChannelListeners(rule, ruleContext(runContext(), advisory), 'advisory');
    listener.Identifier?.(node('hard'));
    listener.Identifier?.(node('soft'));
    expect(advisory.map((r) => r.messageId)).toEqual([ADVISORY_MESSAGE_ID]);
  });

  it('never shares state across lint runs, even with a reused SourceCode', () => {
    const { rule, counter } = countingRule();
    const sourceCode = { text: '' };
    const first = Object.freeze({ filename: '/p/src/a.ts', sourceCode });
    const second = Object.freeze({ filename: '/p/src/a.ts', sourceCode });
    const out: Array<Record<string, unknown>> = [];
    createChannelListeners(rule, ruleContext(first, out), 'blocking');
    const listener = createChannelListeners(rule, ruleContext(second, out), 'advisory');
    listener.Identifier?.(node('soft'));
    expect(counter.creates).toBe(2);
    expect(out.map((r) => r.messageId)).toEqual([ADVISORY_MESSAGE_ID]);
  });
});
