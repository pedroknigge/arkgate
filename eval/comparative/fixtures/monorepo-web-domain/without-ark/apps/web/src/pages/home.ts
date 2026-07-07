import { rows } from '../../../../packages/adapters/db.js';

export function home() {
  return rows.length;
}