import { getUser } from '../application/get-user.js';
import type { UserRepo } from '../application/get-user.js';

export async function handleGetUser(repo: UserRepo, id: string) {
  return getUser(repo, id);
}