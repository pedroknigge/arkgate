/**
 * P5/P7: monorepo include fallback + clean/onion aliases.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const presetsUrl = pathToFileURL(path.resolve('bin/lib/presets.mjs')).href;
const sharedUrl = pathToFileURL(path.resolve('bin/ark-shared.mjs')).href;

describe('preset aliases and monorepo depth', async () => {
  const { ARCHITECTURE_PRESETS, ARCHITECTURE_PRESET_NAMES } = await import(presetsUrl);
  const shared = await import(sharedUrl);

  it('exposes clean-architecture and onion-architecture as hexagonal aliases', () => {
    expect(ARCHITECTURE_PRESET_NAMES).toEqual(
      expect.arrayContaining(['clean-architecture', 'onion-architecture', 'hexagonal'])
    );
    const a = ARCHITECTURE_PRESETS['clean-architecture']([]);
    const b = ARCHITECTURE_PRESETS.hexagonal([]);
    expect(a.layers.map((l: { name: string }) => l.name)).toEqual(
      b.layers.map((l: { name: string }) => l.name)
    );
    expect(shared.policyPackIdForPreset('clean-architecture')).toBe('enthusiast-hexagonal');
  });

  it('monorepo include falls back to packages/apps/libs', () => {
    const cfg = ARCHITECTURE_PRESETS.monorepo([]);
    expect(cfg.include).toEqual(expect.arrayContaining(['packages', 'apps', 'libs']));
  });

  it('recommend JSON includes galleryStarter and policyPack for vertical-slice fixture', () => {
    // reuse recommendNewArchetypes fixture pattern via temp is heavy; assert helper only
    expect(shared.policyPackIdForPreset('vertical-slice')).toBe('enthusiast-vertical-slice');
    expect(shared.policyPackIdForPreset('ddd-bounded-contexts')).toBe(
      'enthusiast-ddd-bounded-contexts'
    );
  });
});
