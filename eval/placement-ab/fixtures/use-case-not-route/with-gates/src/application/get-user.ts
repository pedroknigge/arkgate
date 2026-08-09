import type { User, UserRepository } from '../domain/user.js';

export function getUser(repo: UserRepository, id: string): Promise<User | null> {
  return repo.find(id);
}
