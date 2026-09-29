/**
 * Every config the product writes (`ark init` presets, gallery starters) must
 * build a strict kernel: canonical layer names get built-in intent prefixes, and
 * custom-named deny layers are recorded, never a startup crash.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createArkKernelFromConfig,
  createStrictArkKernelFromConfig,
  type ArkKernelConfig,
} from '../../../src/index';
import { unresolvableLayerFlowLayers } from '../../../src/domain/sourcePolicy';
import {
  ARCHITECTURE_PRESETS,
  ARCHITECTURE_PRESET_NAMES,
  CANONICAL_LAYER_NAMES,
} from '../../../bin/lib/presets.mjs';

const EXAMPLES = path.resolve('examples');

function starterConfigs(): [string, ArkKernelConfig][] {
  return fs
    .readdirSync(EXAMPLES)
    .filter((name) => fs.existsSync(path.join(EXAMPLES, name, 'ark.config.json')))
    .map((name) => [
      name,
      JSON.parse(fs.readFileSync(path.join(EXAMPLES, name, 'ark.config.json'), 'utf8')),
    ]);
}

function presetConfigs(): [string, ArkKernelConfig][] {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-preset-kernel-'));
  try {
    return ARCHITECTURE_PRESET_NAMES.map((name: string) => [
      name,
      (ARCHITECTURE_PRESETS as Record<string, (w: unknown[], r: string) => ArkKernelConfig>)[
        name
      ]!([], root),
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

describe('kernel from shipped configs', () => {
  it.each([...starterConfigs(), ...presetConfigs()])('%s builds a strict kernel', (_name, config) => {
    expect(() => createStrictArkKernelFromConfig(config)).not.toThrow();
    expect(() => createArkKernelFromConfig(config)).not.toThrow();
    // Only custom (non-canonical) layer names can stay unresolvable.
    for (const layer of unresolvableLayerFlowLayers(config)) {
      expect(CANONICAL_LAYER_NAMES.has(layer)).toBe(false);
    }
  });
});
