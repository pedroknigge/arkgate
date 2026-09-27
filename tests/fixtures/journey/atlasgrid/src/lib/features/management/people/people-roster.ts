import { peopleRepository } from '../../../repositories/features/management/people/people-repository';
import { headcount } from '../domain/headcount';
import { managementUtils } from '../management-utils';

export function peopleRoster(): string {
  return [peopleRepository(), headcount(), managementUtils()].join('|');
}
