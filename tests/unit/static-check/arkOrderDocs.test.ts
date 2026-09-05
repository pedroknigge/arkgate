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
    expect(body).toMatch(/apply/);
    expect(body).toMatch(/refreshSigma/);
    expect(body).toMatch(/Layers stop a bad import/);
    expect(body).toMatch(/billing plan/);
    expect(body).toMatch(/seat count/);
    expect(body).toMatch(/valve, not a generic update/);
    expect(body).toMatch(/ArkRun is how the residual travels/);
    expect(body).toMatch(/library/i);
    expect(body).toMatch(/static sensors/i);
    expect(body).toMatch(/not a service/i);
    expect(body).toMatch(/not `@arkgate\/order`/);
    expect(body).toContain(
      'A status you can recompute from data you already have is not a slow decision. Derive it. Do not freeze it.',
    );
    expect(body).toMatch(/check remains silent on semantic entailment/i);
    expect(read('templates/skills/ark-adopt.md')).toMatch(
      /can current σ and s reconstruct it uniquely\?/,
    );
  });

  it('is linked from the docs hub and README', () => {
    expect(read('docs/README.md')).toMatch(/arkorder\.md/);
    expect(read('README.md')).toMatch(/docs\/arkorder\.md/);
    expect(read('docs/use.md')).toMatch(/arkorder\.md/);
    expect(read('docs/develop.md')).toMatch(/arkorder\.md/);
  });

  it('ships in the npm tarball (XP01 findability)', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.files).toContain('docs/arkorder.md');
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

  it('indexes accepted ADR 0034 for the valved loop (LV01)', () => {
    const adr = read('docs/adr/0034-arkorder-valved-loop.md');
    expect(adr).toMatch(/Accepted/);
    expect(adr).toMatch(/ARKORDER_UNVALVED_RELEASE/);
    expect(adr).toMatch(/refreshSigma/);
    expect(adr).toMatch(/xiHash/);
    expect(adr).toMatch(/escalate_up/);
    expect(adr).toMatch(/ReleaseStore/);
    expect(adr).toMatch(/does \*\*not\*\* close `K01`/i);
    expect(read('docs/adr/README.md')).toMatch(/0034-arkorder-valved-loop/);
  });
});
