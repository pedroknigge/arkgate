import { peopleRepository } from '../repositories/features/management/people/people-repository';

export function clock(): string {
  return [peopleRepository()].join('|');
}
