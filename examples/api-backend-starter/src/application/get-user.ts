/** ApplicationOrchestration — fetch a user through the repository port. */

import type { User, UserRepository } from '../domain/user.js';

export type UserResponse = { id: string; email: string };

export async function getUser(repo: UserRepository, id: string): Promise<UserResponse | null> {
  const user: User | null = await repo.findById(id);
  if (!user) return null;
  return { id: user.id, email: user.email };
}