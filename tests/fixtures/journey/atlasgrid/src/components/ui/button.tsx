import { rfiStatus } from '../features/projects/rfi/rfi-status';

export function button(): string {
  return [rfiStatus()].join('|');
}
