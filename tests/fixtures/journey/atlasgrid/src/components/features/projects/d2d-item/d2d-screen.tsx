import { d2dItem } from '../../../../lib/features/projects/d2d-item/d2d-item';

export function d2dScreen(): string {
  return [d2dItem()].join('|');
}
