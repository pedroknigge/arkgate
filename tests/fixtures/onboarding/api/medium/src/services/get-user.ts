import type { User } from '@api/domain/user';
export const getUser = (id: string): User => ({ id });
