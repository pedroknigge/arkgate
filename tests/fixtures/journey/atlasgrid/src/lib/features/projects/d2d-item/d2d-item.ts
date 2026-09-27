import { d2dRepository } from '../../../repositories/features/projects/d2d-item/d2d-repository';
import { itemRef } from '../domain/item-ref';
import { projectsUtils } from '../projects-utils';

export function d2dItem(): string {
  return [d2dRepository(), itemRef(), projectsUtils()].join('|');
}
