import { registerAll } from '../../../shared/composition/register-all';

export function rfiDeps(): number {
  return registerAll().length;
}
