/**
 * vertical-slice preset: factory shape + peerIsolation on Features.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isEdgeDenied,
  layerForRelativePath,
} from '../../../src/domain/layerMatch';

const presetsUrl = pathToFileURL(
  path.resolve('bin/lib/presets.mjs')
).href;

describe('vertical-slice preset', async () => {
  const { ARCHITECTURE_PRESETS, ARCHITECTURE_PRESET_NAMES } = await import(presetsUrl);

  it('is registered in the public preset list', () => {
    expect(ARCHITECTURE_PRESET_NAMES).toContain('vertical-slice');
    expect(ARCHITECTURE_PRESET_NAMES).toContain('ui-surface');
    expect(typeof ARCHITECTURE_PRESETS['vertical-slice']).toBe('function');
  });

  it('classifies features/shared/lib/app paths', () => {
    const cfg = ARCHITECTURE_PRESETS['vertical-slice']([]);
    expect(layerForRelativePath('src/features/auth/api.ts', cfg.layers)).toBe('Features');
    expect(layerForRelativePath('src/shared/ui/Button.ts', cfg.layers)).toBe('Shared');
    expect(layerForRelativePath('src/lib/db.ts', cfg.layers)).toBe('Lib');
    expect(layerForRelativePath('src/app/layout.ts', cfg.layers)).toBe('App');
  });

  it('enforces peerIsolation across feature slices', () => {
    const cfg = ARCHITECTURE_PRESETS['vertical-slice']([]);
    expect(
      isEdgeDenied(cfg.rules, 'Features', 'Features', {
        fromPath: 'src/features/auth/api.ts',
        toPath: 'src/features/payments/charge.ts',
        layers: cfg.layers,
      })
    ).toBe(true);
    expect(
      isEdgeDenied(cfg.rules, 'Features', 'Features', {
        fromPath: 'src/features/auth/api.ts',
        toPath: 'src/features/auth/token.ts',
        layers: cfg.layers,
      })
    ).toBe(false);
  });

  it('allows Features → Shared and Features → Lib; denies Shared → Features and Features → App', () => {
    const cfg = ARCHITECTURE_PRESETS['vertical-slice']([]);
    expect(isEdgeDenied(cfg.rules, 'Features', 'Shared')).toBe(false);
    expect(isEdgeDenied(cfg.rules, 'Features', 'Lib')).toBe(false);
    expect(isEdgeDenied(cfg.rules, 'Shared', 'Features')).toBe(true);
    expect(isEdgeDenied(cfg.rules, 'Lib', 'Features')).toBe(true);
    expect(isEdgeDenied(cfg.rules, 'Features', 'App')).toBe(true);
  });
});
