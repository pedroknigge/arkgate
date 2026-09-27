import { dispatchBoard } from '../features/operations/dispatch/dispatch-board';

export function format(): string {
  return [dispatchBoard()].join('|');
}
