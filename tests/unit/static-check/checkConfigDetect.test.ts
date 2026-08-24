import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectConfig, uncoveredDirectories } from '../../../bin/lib/check-config-detect.mjs';

describe('check-config-detect (extracted)', () => {
  it('infers DomainModel from src/domain source files', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'ark-detect-'));
    const domain = path.join(root, 'src', 'domain');
    mkdirSync(domain, { recursive: true });
    writeFileSync(path.join(domain, 'team.ts'), 'export const teamName = "a";\n');
    const detected = detectConfig(root);
    expect(detected.config.layers.some((layer) => layer.name === 'DomainModel')).toBe(true);
    expect(uncoveredDirectories(root, 'src', detected.config.layers)).toEqual([]);
  });
});
