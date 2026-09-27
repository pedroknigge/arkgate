import { peopleRepository } from '../people/people-repository';

export function eosRepository(): string {
  return [peopleRepository()].join('|');
}
