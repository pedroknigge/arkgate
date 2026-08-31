import { describe, expect, it } from 'vitest';
import {
  compareInformationPackages,
  replayInformationPackages,
  shadowInformationPackage,
} from '../../../src/domain/arkRunCompare';
import type { DependencyInformationPackage } from '../../../src/domain/arkRunInformationPackage';

function pack(
  id: string,
  extra?: Partial<DependencyInformationPackage['components'][number]>
): DependencyInformationPackage {
  return {
    schemaVersion: '1.0',
    kernelInstanceId: 'k1',
    components: [
      {
        id,
        lifetime: 'singleton',
        uses: [],
        reactsTo: [],
        raises: [],
        sends: extra?.sends ?? [],
      },
    ],
  };
}

describe('arkRunCompare (XP07)', () => {
  it('shadows without sharing the live array', () => {
    const live = pack('billing');
    const shot = shadowInformationPackage(live);
    expect(shot).toEqual(live);
    expect(shot.components).not.toBe(live.components);
  });

  it('compare reports a send-list drift', () => {
    const left = pack('billing');
    const right = pack('billing', { sends: ['InvoicePosted'] });
    const result = compareInformationPackages(left, right);
    expect(result.equal).toBe(false);
    expect(result.diffs.some((diff) => diff.path.includes('sends'))).toBe(true);
  });

  it('replay compares sequential snapshots in memory', () => {
    const a = pack('billing');
    const b = pack('billing', { sends: ['InvoicePosted'] });
    const steps = replayInformationPackages([a, b, b]);
    expect(steps).toHaveLength(2);
    expect(steps[0]?.equal).toBe(false);
    expect(steps[1]?.equal).toBe(true);
  });
});
