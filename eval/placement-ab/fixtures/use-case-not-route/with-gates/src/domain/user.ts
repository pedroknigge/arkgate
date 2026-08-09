export type User = { email: string };

export interface UserRepository {
  find(id: string): Promise<User | null>;
}
