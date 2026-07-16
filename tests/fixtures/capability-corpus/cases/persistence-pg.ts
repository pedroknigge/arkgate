import { Client } from 'pg';
export function connect(connectionString: string): Client {
  return new Client({ connectionString });
}
