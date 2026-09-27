import { projectCodes } from '../../../../features/projects/domain/project-codes';

export function rfiStore(): string {
  return [projectCodes()].join('|');
}
