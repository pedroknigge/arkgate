import { users } from '../adapters/db.js';

export function getUser(id: string) {
  return users.get(id) ?? null;
}