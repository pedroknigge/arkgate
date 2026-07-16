import { readFileSync } from 'node:fs';
export function readText(p: string): string {
  return readFileSync(p, 'utf8');
}
