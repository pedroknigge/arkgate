import { readFile } from 'node:fs/promises';
export function readText(p: string): Promise<string> {
  return readFile(p, 'utf8');
}
