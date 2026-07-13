import { registerUser } from '@api/services/register-user';
export const userRoute = (id: string) => registerUser(id);
