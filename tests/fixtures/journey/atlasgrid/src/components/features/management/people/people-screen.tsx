import { peopleRoster } from '../../../../lib/features/management/people/people-roster';

export function peopleScreen(): string {
  return [peopleRoster()].join('|');
}
