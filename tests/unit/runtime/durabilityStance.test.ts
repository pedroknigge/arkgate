/**
 * R9 — durability stance is explicit in shipped sources and product docs.
 * Drives real files from the package (not re-implemented prose).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  InMemoryOutboxStore,
  InMemoryEventBuffer,
  InMemoryAuditStore,
  InMemoryReadModelStore,
  InMemoryWorkflowStore,
} from '../../../src/index';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readSrc(rel: string): string {
  return readFileSync(path.join(ROOT, rel), 'utf8');
}

describe('R9 runtime durability stance', () => {
  it('exports the reference InMemory store classes (shipped defaults)', () => {
    expect(typeof InMemoryOutboxStore).toBe('function');
    expect(InMemoryEventBuffer).toBe(InMemoryOutboxStore);
    expect(typeof InMemoryAuditStore).toBe('function');
    expect(typeof InMemoryReadModelStore).toBe('function');
    expect(typeof InMemoryWorkflowStore).toBe('function');
  });

  it('documents not-production-durability on store interfaces and InMemory classes', () => {
    const sources = [
      'src/kernel/outbox/types.ts',
      'src/kernel/outbox/InMemoryOutboxStore.ts',
      'src/kernel/audit/types.ts',
      'src/kernel/audit/AuditTrail.ts',
      'src/kernel/projections/types.ts',
      'src/kernel/projections/ProjectionRegistry.ts',
      'src/kernel/workflow/types.ts',
      'src/kernel/workflow/Saga.ts',
    ];
    for (const rel of sources) {
      const text = readSrc(rel);
      // Accept either the explicit phrase or the R9 stance header + "production durability".
      const ok =
        /not[\s*]+production durability/i.test(text) ||
        (/Durability stance \(R9\)/i.test(text) && /production durability/i.test(text));
      expect(ok, rel).toBe(true);
    }
  });

  it('states the stance in README and production-hardening', () => {
    const readme = readSrc('README.md');
    expect(readme).toMatch(/Durability stance/);
    expect(readme).toMatch(/InMemoryEventBuffer/);
    expect(readme).toMatch(/not[\s*]+production durability/i);
    expect(readme).toMatch(/production-hardening\.md/);

    const hardening = readSrc('docs/production-hardening.md');
    expect(hardening).toMatch(/Durability stance \(R9\)/);
    expect(hardening).toMatch(/does not ship production-durable adapters/i);
    expect(hardening).toMatch(/InMemoryEventBuffer/);
  });

  it('package-surface marks runtime stores as InMemory reference only', () => {
    const surface = readSrc('docs/package-surface.md');
    expect(surface).toMatch(/InMemory reference only/i);
    expect(surface).toMatch(/production-hardening\.md/);
  });
});
