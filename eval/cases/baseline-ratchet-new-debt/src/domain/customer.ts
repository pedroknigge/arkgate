import { db } from '../infra/db';

export function placeCustomer(id: string) {
  return db.save(id);
}

