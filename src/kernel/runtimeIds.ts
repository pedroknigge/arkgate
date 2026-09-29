/**
 * Collision-resistant runtime ids for kernel records (kernel instances, buffer
 * records, audit entries, workflows, interceptors).
 *
 * A plain `Date.now()` + module counter collides when two copies of the kernel
 * module are loaded in one process (ESM + CJS dual load, or two bundles), because
 * each copy starts its counter at 1. A per-module-copy random nonce keeps ids
 * unique across copies while the counter keeps them ordered within one copy.
 */

function randomNonce(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID().replace(/-/g, '').slice(0, 10);
  }
  return Math.random().toString(36).slice(2, 12).padEnd(10, '0');
}

const MODULE_NONCE = randomNonce();
const sequences = new Map<string, number>();

/** `${prefix}-${Date.now()}-${nonce}-${seq}` — unique across module copies. */
export function nextRuntimeId(prefix: string): string {
  const seq = (sequences.get(prefix) ?? 0) + 1;
  sequences.set(prefix, seq);
  return `${prefix}-${Date.now()}-${MODULE_NONCE}-${seq}`;
}
