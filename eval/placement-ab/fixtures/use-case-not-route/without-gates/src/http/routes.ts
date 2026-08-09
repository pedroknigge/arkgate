import { users } from '../adapters/db.js';

/** Misplaced: HTTP layer owns the use case and reaches persistence directly. */
export function getUser(id: string) {
  return users.get(id) ?? null;
}
