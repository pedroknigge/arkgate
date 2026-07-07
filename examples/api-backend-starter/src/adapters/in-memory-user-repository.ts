/** PersistenceAdapters — in-memory UserRepository for scaffolding. */

import type { User, UserRepository } from '../domain/user.js';

export function createInMemoryUserRepository(seed: User[] = []): UserRepository {
  const store = new Map(seed.map((user) => [user.id, user]));
  return {
    async findById(id) {
      return store.get(id) ?? null;
    },
  };
}