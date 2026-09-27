import { headcount } from '../../../../features/management/domain/headcount';

export function peopleRepository(): string {
  return [headcount()].join('|');
}
