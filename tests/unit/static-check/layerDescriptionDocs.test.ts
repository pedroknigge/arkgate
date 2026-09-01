/**
 * LD06 — pin public docs for layers[].description (ADR 0035 D2).
 * App-context caption example; absence silent; no schema bump; no 14th skill.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARK_SKILL_NAME_COUNT, ARK_SKILL_NAMES } from '../../../src/domain/agentSkillsPackage.ts';
import { ARK_CONFIG_SCHEMA_VERSION } from '../../../src/domain/configContract.ts';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CAPTION = 'Purchase requests — from asked to received.';

function read(rel: string) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('LD06 public docs name layers[].description (ADR 0035 D2)', () => {
  it('configuration.md names the field and shows an app-context caption example', () => {
    const body = read('docs/configuration.md');
    expect(body).toContain('layers[].description');
    expect(body).toMatch(/app-context caption|app context/i);
    expect(body).toContain(CAPTION);
    expect(body).toMatch(/does \*\*not\*\* change `policyHash`|does not change `policyHash`/i);
    expect(body).toMatch(/Absence is silent/i);
    expect(body).toMatch(/never fails `--strict-config`/);
    expect(body).toMatch(/never invents a doctor residual/);
    expect(body).toMatch(/Compact starters may omit/);
    expect(body).toMatch(/No\s+`?\/ark-describe`/);
    expect(body).toMatch(/schemaVersion": "1\.3"/);
  });

  it('package-surface.md names the caption as a stable projection, not a score', () => {
    const body = read('docs/package-surface.md');
    expect(body).toContain('layers[].description');
    expect(body).toContain(CAPTION);
    expect(body).toMatch(/app context/i);
    expect(body).toMatch(/no `schemaVersion` bump/);
    expect(body).toMatch(/Never a residual, never a score|never a score/i);
    expect(body).toMatch(/Stripped from `policyHash`/);
    expect(body).toMatch(/current published:.*4\.8\.7/is);
    expect(body).toMatch(/prior published:.*4\.8\.6/is);
  });

  it('keeps schemaVersion 1.3 and the frozen 13 skill names', () => {
    expect(ARK_CONFIG_SCHEMA_VERSION).toBe('1.3');
    expect(ARK_SKILL_NAME_COUNT).toBe(13);
    expect(ARK_SKILL_NAMES).toHaveLength(13);
    expect(ARK_SKILL_NAMES).not.toContain('ark-describe');
    expect(read('docs/releases/4.8.7.md')).toMatch(/schemaVersion.*1\.3|still `1\.3`/);
    expect(read('docs/releases/4.8.7.md')).toMatch(/still 13/);
    expect(read('ROADMAP.md')).toMatch(/`K01` \| `parked`/);
    expect(read('ROADMAP.md')).toMatch(/Z09 still parked/);
    expect(read('docs/releases/4.8.7.md')).not.toMatch(/closes K01|Z09 closed/i);
  });
});
