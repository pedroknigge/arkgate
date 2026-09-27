import { scmBoard } from '../features/projects/scm/scm-board';

export function labels(): string {
  return [scmBoard()].join('|');
}
