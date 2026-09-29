import { describe, expect, it } from 'vitest';
import * as root from '../../../src/gate';

describe('ArkRules root export (arkrules cluster)', () => {
  it('exports ArkRulesValidationError so consumers can instanceof-check parse failures', () => {
    expect(typeof root.ArkRulesValidationError).toBe('function');
    let caught: unknown;
    try {
      root.parseArkRulesJson('{"bad":1}');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(root.ArkRulesValidationError);
    const issues: root.ArkRulesIssue[] = (
      caught as InstanceType<typeof root.ArkRulesValidationError>
    ).issues;
    expect(Array.isArray(issues)).toBe(true);
    expect(issues.length).toBeGreaterThan(0);
  });
});
