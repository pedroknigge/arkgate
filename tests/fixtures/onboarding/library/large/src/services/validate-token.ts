import { acceptsToken } from '@lib/domain/token-policy';
export const validateToken = (value: string) => acceptsToken(value);
