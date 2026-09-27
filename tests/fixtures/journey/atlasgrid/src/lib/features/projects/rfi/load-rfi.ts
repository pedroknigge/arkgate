import { scmBoard } from '../scm/scm-board';
import { eosSummary } from '../../management/eos/eos-summary';
import { projectCodes } from '../domain/project-codes';
import { labels } from '../../../shared/labels';
import { projectsUtils } from '../projects-utils';
import { rfiRepository } from '../../../repositories/features/projects/rfi-repository';
import { catalogRepository } from '../../../repositories/features/projects/catalog-repository';

export function loadRfi(): string {
  return [scmBoard(), eosSummary(), projectCodes(), labels(), projectsUtils(), rfiRepository(), catalogRepository()].join('|');
}
