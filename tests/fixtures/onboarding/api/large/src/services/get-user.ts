import { userId } from '@api/domain/user-id';
export const getUser = (id: string) => ({ id: userId(id) });
