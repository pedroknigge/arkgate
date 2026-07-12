import { saveUser } from '@api/adapters/user-repository';
export const userRoute = (id: string) => saveUser(id);
