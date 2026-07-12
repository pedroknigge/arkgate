import { getUser } from '@api/services/get-user';
export const userRoute = (id: string) => getUser(id);
