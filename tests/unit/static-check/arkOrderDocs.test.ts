/**
 * XP01 — docs/arkorder.md is the findable surface for shipped ArkOrder APIs.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function read(rel: string) {
  return fs.readFileSync(path.join(REPO, rel), 'utf8');
}

describe('docs/arkorder.md (XP01)', () => {
  it('exists and names shipped APIs plus the not-a-service line', () => {
    const body = read('docs/arkorder.md');
    expect(body).toMatch(/createOrderPlane/);
    expect(body).toMatch(/IngestEscalate/);
    expect(body).toMatch(/Projector/);
    expect(body).toMatch(/maxXiKeys/);
    expect(body).toMatch(/ProposeResult/);
    expect(body).toMatch(/XiSchema/);
    expect(body).toMatch(/xiKeys/);
    expect(body).toMatch(/release/);
    expect(body).toMatch(/project/);
    expect(body).toMatch(/ingest/);
    expect(body).toMatch(/proposeRelease/);
    expect(body).toMatch(/library/i);
    expect(body).toMatch(/static sensors/i);
    expect(body).toMatch(/not a service/i);
    expect(body).toMatch(/not `@arkgate\/order`/);
  });

  it('is linked from the docs hub and README', () => {
    expect(read('docs/README.md')).toMatch(/arkorder\.md/);
    expect(read('README.md')).toMatch(/docs\/arkorder\.md/);
  });
});
