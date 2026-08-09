import { db } from '../adapters/db.js';

/** Misplaced: domain imports a concrete adapter instead of a port. */
export async function listTodos() {
  return db.query();
}
