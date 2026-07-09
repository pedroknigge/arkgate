import { db } from '../infra/db';

export function placeOrder(id: string) {
  return db.save(id);
}

