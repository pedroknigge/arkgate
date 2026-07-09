import { describe, it, expect } from 'vitest';
import {
  applyPayloadPatch,
  mergeRecordPatch,
} from '../../../src/kernel/event-bus/payloadPatch';

describe('payloadPatch (EventBus interceptor helpers)', () => {
  it('fills missing object keys without overwriting existing values', () => {
    const next = applyPayloadPatch(
      { id: '1', nested: { a: 1 } },
      { extra: true, nested: { b: 2 } }
    );
    expect(next).toEqual({ id: '1', nested: { a: 1, b: 2 }, extra: true });
  });

  it('refuses to overwrite an existing leaf', () => {
    expect(() =>
      mergeRecordPatch({ id: '1' }, { id: '2' })
    ).toThrow(/cannot overwrite existing payload\.id/);
  });

  it('fills array holes without clobbering existing indices', () => {
    const next = applyPayloadPatch(
      [undefined as unknown as number, 2],
      [1]
    );
    expect(next).toEqual([1, 2]);
    expect(() => applyPayloadPatch([1], [9])).toThrow(/cannot overwrite/);
  });
});

