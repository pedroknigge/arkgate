import { scmBoard } from '../../../../lib/features/projects/scm/scm-board';

export function scmRow(): string {
  return [scmBoard()].join('|');
}
