/**
 * ddd-bounded-contexts preset: classification + inter-context peerIsolation.
 */
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  isEdgeDenied,
  layerForRelativePath,
} from '../../../src/domain/layerMatch';

const presetsUrl = pathToFileURL(path.resolve('bin/lib/presets.mjs')).href;

describe('ddd-bounded-contexts preset', async () => {
  const { ARCHITECTURE_PRESETS, ARCHITECTURE_PRESET_NAMES } = await import(presetsUrl);

  it('is registered', () => {
    expect(ARCHITECTURE_PRESET_NAMES).toContain('ddd-bounded-contexts');
  });

  it('classifies context paths and shared kernel', () => {
    const cfg = ARCHITECTURE_PRESETS['ddd-bounded-contexts']([]);
    expect(
      layerForRelativePath('src/contexts/billing/domain/invoice.ts', cfg.layers)
    ).toBe('DomainModel');
    expect(
      layerForRelativePath('src/contexts/billing/application/open.ts', cfg.layers)
    ).toBe('ApplicationOrchestration');
    expect(layerForRelativePath('src/shared/kernel/money.ts', cfg.layers)).toBe(
      'SharedKernel'
    );
  });

  it('denies domain→domain across contexts; allows same context', () => {
    const cfg = ARCHITECTURE_PRESETS['ddd-bounded-contexts']([]);
    expect(
      isEdgeDenied(cfg.rules, 'DomainModel', 'DomainModel', {
        fromPath: 'src/contexts/billing/domain/a.ts',
        toPath: 'src/contexts/identity/domain/b.ts',
        layers: cfg.layers,
      })
    ).toBe(true);
    expect(
      isEdgeDenied(cfg.rules, 'DomainModel', 'DomainModel', {
        fromPath: 'src/contexts/billing/domain/a.ts',
        toPath: 'src/contexts/billing/domain/b.ts',
        layers: cfg.layers,
      })
    ).toBe(false);
  });

  it('denies domain → infrastructure (classic)', () => {
    const cfg = ARCHITECTURE_PRESETS['ddd-bounded-contexts']([]);
    expect(isEdgeDenied(cfg.rules, 'DomainModel', 'PersistenceAdapters')).toBe(true);
  });

  it('denies application→domain across contexts (cross-layer peerIsolation)', () => {
    const cfg = ARCHITECTURE_PRESETS['ddd-bounded-contexts']([]);
    expect(
      isEdgeDenied(cfg.rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/contexts/billing/application/open.ts',
        toPath: 'src/contexts/identity/domain/user.ts',
        layers: cfg.layers,
      })
    ).toBe(true);
    expect(
      isEdgeDenied(cfg.rules, 'ApplicationOrchestration', 'DomainModel', {
        fromPath: 'src/contexts/billing/application/open.ts',
        toPath: 'src/contexts/billing/domain/invoice.ts',
        layers: cfg.layers,
      })
    ).toBe(false);
  });
});
