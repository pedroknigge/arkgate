import { dispatchBoard } from './dispatch-board';

export function dispatchNote(): string {
  return [dispatchBoard()].join('|');
}
