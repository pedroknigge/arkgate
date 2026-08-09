import type { User, UserRepository } from '../domain/user.js';

export function createUserRepo(seed: Map<string, User> = new Map()): UserRepository {
  return {
    async find(id) {
      return seed.get(id) ?? null;
    },
  };
}
