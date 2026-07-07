export function createRepo() {
  const users = new Map<string, { email: string }>();
  return {
    async find(id: string) {
      return users.get(id) ?? null;
    },
  };
}