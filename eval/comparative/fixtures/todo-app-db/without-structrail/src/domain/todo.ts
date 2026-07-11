import { db } from '../adapters/db.js';

export async function listTodos() {
  return db.query();
}