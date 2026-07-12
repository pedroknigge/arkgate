import { tokenId } from '@lib/domain/token-id';
export const createToken = (value: string) => ({ value: tokenId(value) });
