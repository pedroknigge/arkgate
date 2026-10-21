import { db } from '@repo/data';

export function total(row: { cents: number }) {
  return db ? row.cents : 0;
}
