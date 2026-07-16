import type { AxiosInstance } from 'axios';
export function describeClient(client: AxiosInstance): string {
  return String(client.defaults.baseURL ?? '');
}
