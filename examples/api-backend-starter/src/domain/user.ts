/** DomainModel — user entity and repository port. */

export type UserId = string;

export type User = {
  id: UserId;
  email: string;
};

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
}

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!value.includes('@')) {
    throw new Error('Invalid email');
  }
  return value;
}