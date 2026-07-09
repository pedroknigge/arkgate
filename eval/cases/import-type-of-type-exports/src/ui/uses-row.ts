import { Row } from '../data/mixed';

// Value-syntax import of a type-only export from a mixed module (R6 mechanical-safe).
export function label(row: Row): string {
  return row.id;
}

