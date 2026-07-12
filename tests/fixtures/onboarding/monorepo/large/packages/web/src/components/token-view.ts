import { saveToken } from '@o04/api/adapters/token-store';
export const tokenView = (value: string) => saveToken(value);
