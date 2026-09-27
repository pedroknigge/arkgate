import { result } from '../../shared/result';

export function externalUtils(): string {
  return [result()].join('|');
}
