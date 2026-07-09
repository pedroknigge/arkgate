import { insert } from '../../db/store';

export type Thread = { id: string };

// Monorepo frontend application bag must not reach into frontend/src/db.
export function createThread(id: string): Thread {
  insert(id);
  return { id };
}

