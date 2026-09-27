import { loadRfi } from '../../../../lib/features/projects/rfi/load-rfi';
import { dialog } from '../../../ui/dialog';

export function rfiScreen(): string {
  return [loadRfi(), dialog()].join('|');
}
