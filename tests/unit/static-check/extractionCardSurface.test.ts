/**
 * P05 — extraction-card template productized in docs + skills (structural proof).
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('P05 extraction card product surface', () => {
  it('brownfield-adoption.md defines the fixed extraction-card template fields', () => {
    const body = read('docs/brownfield-adoption.md');
    expect(body).toMatch(/## 6\. Shape residual — extraction cards/i);
    expect(body).toContain('### Extraction card');
    expect(body).toMatch(/Pilot:/);
    expect(body).toMatch(/Smell:/);
    expect(body).toMatch(/Move:/);
    expect(body).toMatch(/Do not:/);
    expect(body).toMatch(/Success:/);
    expect(body).toMatch(/Kill-switch:/);
    expect(body).toMatch(/never invent a codemod|no general codemod/i);
    expect(body).toMatch(/silent auto-apply|never silent/i);
    expect(body).toContain('tests/fixtures/design-weak-enforce');
  });

  it('critical skills link the same template vocabulary', () => {
    for (const skill of ['ark-explore.md', 'ark-fix.md', 'ark-autopilot.md', 'ark-loop.md']) {
      const body = read(path.join('templates/skills', skill));
      expect(body, skill).toMatch(/extraction card/i);
      expect(body, skill).toMatch(/neverMechanicalSafe|mechanical-safe|never mechanical-safe/i);
    }
    const explore = read('templates/skills/ark-explore.md');
    expect(explore).toContain('### Extraction card');
    expect(explore).toMatch(/Pilot:/);
    expect(explore).toMatch(/Kill-switch:/);
    expect(explore).toMatch(/brownfield-adoption\.md/);
  });

  it('package-surface documents patternBets neverMechanicalSafe', () => {
    const body = read('docs/package-surface.md');
    expect(body).toMatch(/patternBets/);
    expect(body).toMatch(/neverMechanicalSafe/);
    expect(body).toMatch(/designSmells|designFitness/);
  });
});
