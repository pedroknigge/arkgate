import type { UserRepository } from '../domain/user.js';
import { getUser } from '../application/get-user.js';

export function handleGetUser(repo: UserRepository, id: string) {
  return getUser(repo, id);
}
