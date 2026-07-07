export type UserRepo = { find(id: string): Promise<{ email: string } | null> };

export async function getUser(repo: UserRepo, id: string) {
  return repo.find(id);
}