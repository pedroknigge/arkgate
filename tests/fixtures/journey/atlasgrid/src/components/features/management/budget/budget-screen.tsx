import { budgetLines } from '../../../../lib/features/management/budget/budget-lines';

export function budgetScreen(): string {
  return [budgetLines()].join('|');
}
