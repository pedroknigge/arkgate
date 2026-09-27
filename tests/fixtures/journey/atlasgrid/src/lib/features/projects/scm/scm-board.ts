import { catalogRepository } from '../../../repositories/features/projects/catalog-repository';
import { projectsUtils } from '../projects-utils';
import { scmRepository } from '../../../repositories/features/projects/scm/scm-repository';
import { itemRef } from '../domain/item-ref';

export function scmBoard(): string {
  return [catalogRepository(), projectsUtils(), scmRepository(), itemRef()].join('|');
}
