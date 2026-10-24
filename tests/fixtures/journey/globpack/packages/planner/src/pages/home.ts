import { getPlanner01 } from '../adapters/store/getPlanner01';

export function home() {
  return getPlanner01('home');
}
