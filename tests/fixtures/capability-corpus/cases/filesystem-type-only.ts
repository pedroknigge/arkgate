import type { Stats } from 'node:fs';
export function isRecent(s: Stats): boolean {
  return s.mtimeMs > 0;
}
