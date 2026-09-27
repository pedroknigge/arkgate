import { budgetRepository } from '../../../repositories/features/management/budget/budget-repository';
import { managementUtils } from '../management-utils';
import { d2dItem } from '../../projects/d2d-item/d2d-item';

export function budgetLines(): string {
  return [budgetRepository(), managementUtils(), d2dItem()].join('|');
}
