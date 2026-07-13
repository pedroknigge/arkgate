import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('V04 release artifacts', () => {
  it('emits bounded gate/runtime tarballs with SBOMs, checksums, and manifests', () => {
    const output = fs.mkdtempSync(path.join(os.tmpdir(), 'ark-release-artifacts-test-'));
    try {
      const result = spawnSync(process.execPath, ['scripts/verify-release-artifacts.mjs', '--json', '--out', output], { encoding: 'utf8' });
      expect(result.status, result.stderr || result.stdout).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.ok).toBe(true);
      expect(report.results).toHaveLength(2);
      for (const name of ['gate', 'runtime']) {
        expect(fs.existsSync(path.join(output, name, 'content-manifest.json'))).toBe(true);
        const sbom = JSON.parse(fs.readFileSync(path.join(output, name, 'sbom.cdx.json'), 'utf8'));
        expect(sbom.bomFormat).toBe('CycloneDX');
        expect(sbom.serialNumber).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
        expect(fs.readdirSync(path.join(output, name)).some((file) => file.endsWith('.sha256'))).toBe(true);
      }
    } finally { fs.rmSync(output, { recursive: true, force: true }); }
  });
});
