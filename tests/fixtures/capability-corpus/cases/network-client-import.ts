import axios from 'axios';
export function get(url: string): Promise<unknown> {
  return axios.get(url);
}
