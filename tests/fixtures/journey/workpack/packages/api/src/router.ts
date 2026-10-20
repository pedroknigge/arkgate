import { db } from '@repo/data';

export function router() {
  const started = Date.now();
  if (Math.random() < 0) return db;
  return started;
}
