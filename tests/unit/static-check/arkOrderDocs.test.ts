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

  it('documents one extra activation shape and keeps distinct factory roots (XP02)', () => {
    const body = read('docs/arkorder.md');
    expect(body).toMatch(/mode/);
    expect(body).toMatch(/managedLayers/);
    expect(body).toMatch(/planeRoots/);
    expect(body).toMatch(/kernelRoots/);
    expect(body).toMatch(/compositionRoots/);
    expect(read('docs/configuration.md')).toMatch(/Activation is one shape/);
  });

  it('points at ADR 0033 for the runtime-half decision (XP03)', () => {
    expect(read('docs/adr/0033-arkorder-runtime-half-is-arkrun.md')).toMatch(/Accepted/);
    expect(read('docs/adr/0033-arkorder-runtime-half-is-arkrun.md')).toMatch(/belongs to ArkRun/);
    expect(read('docs/adr/README.md')).toMatch(/0033-arkorder-runtime-half-is-arkrun/);
  });
});
