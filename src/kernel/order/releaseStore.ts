/**
 * Injected ReleaseStore port (ADR 0034 D8). In-memory default is not durable.
 * Does not close K01.
 */
import type { Release } from '../../domain/arkOrderTypes';

export type ReleaseStore = {
  load(): Release | null;
  save(release: Release): void;
};

export function createMemoryReleaseStore(initial?: Release | null): ReleaseStore {
  let held: Release | null = initial ?? null;
  return {
    load() {
      return held;
    },
    save(release) {
      held = release;
    },
  };
}
