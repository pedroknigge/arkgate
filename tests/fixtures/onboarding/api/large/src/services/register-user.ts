import { getUser } from '@api/services/get-user';
export const registerUser = (id: string) => getUser(id);
