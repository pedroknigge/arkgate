// Lives under a PersistenceAdapters-style layer in the policy fixture: detection fires,
// the layer policy allows it, and the verdict stays green (ADR 0009 D7).
import { Client } from 'pg';
export function makeClient(connectionString: string): Client {
  return new Client({ connectionString });
}
