import { scmBoard } from '../../../../lib/features/projects/scm/scm-board';

export function scmScreen(): string {
  return [scmBoard()].join('|');
}
