import { scmBoard } from '../../../../features/projects/scm/scm-board';

export function dispatchRepository(): string {
  return [scmBoard()].join('|');
}
