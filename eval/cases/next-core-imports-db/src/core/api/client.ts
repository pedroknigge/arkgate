import { put } from '../../db/store';

// Next application bag (src/core/**) must not import persistence directly.
export function saveGoal(id: string, text: string) {
  put(id, text);
  return id;
}

