/**
 * Upgrade what’s-new / suggested improvements — real shipped helpers.
 * No re-implementation: import production module and assert contract.
 */
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line -- runtime .mjs under test
import {
  buildUpgradeWhatsNewSuggestions,
  formatUpgradeWhatsNewSuggestions,
  UPGRADE_WHATS_NEW_SCHEMA_VERSION,
} from '../../../bin/lib/upgrade-whats-new.mjs';

const REQUIRED_IDS = [
  'five-door-autonomy',
  'team-parliament',
  'plain-language-doctor',
  'shared-agent-homes',
  'deep-module-coach',
  'improvement-compass',
  'session-status-honesty',
  'two-axis-done',
  'upgrade-self-service',
] as const;

describe('buildUpgradeWhatsNewSuggestions (shipped product list)', () => {
  it('returns notAScore advisory list with required product capabilities', () => {
    const payload = buildUpgradeWhatsNewSuggestions();
    expect(payload.schemaVersion).toBe(UPGRADE_WHATS_NEW_SCHEMA_VERSION);
    expect(payload.notAScore).toBe(true);
    expect(payload.neverGateInput).toBe(true);
    expect(payload).not.toHaveProperty('score');
    expect(payload).not.toHaveProperty('rank');
    expect(Array.isArray(payload.items)).toBe(true);
    const ids = payload.items.map((i: { id: string }) => i.id);
    for (const id of REQUIRED_IDS) {
      expect(ids, `missing suggestion id ${id}`).toContain(id);
    }
    for (const item of payload.items) {
      expect(item.title?.length).toBeGreaterThan(3);
      expect(item.try?.length).toBeGreaterThan(3);
      expect(item.inspect?.length).toBeGreaterThan(3);
      expect(item.why?.length).toBeGreaterThan(10);
      expect(String(item.why)).not.toMatch(/\bExcellent\b|\d+\s*\/\s*10/);
    }
  });

  it('formatUpgradeWhatsNewSuggestions prints try/inspect lines without score language', () => {
    const lines = formatUpgradeWhatsNewSuggestions(buildUpgradeWhatsNewSuggestions());
    expect(lines.length).toBeGreaterThan(5);
    expect(lines.join('\n')).toMatch(/not a score/i);
    expect(lines.join('\n')).toMatch(/deep-module|Deep-module|hot paths/i);
    expect(lines.join('\n')).toMatch(/compass|residual/i);
    expect(lines.join('\n')).toMatch(/two-axis|feature done|Enforce green/i);
    expect(lines.join('\n')).not.toMatch(/Excellent|\d+\s*\/\s*10/);
  });
});
