import { eosSummary } from '../features/management/eos/eos-summary';
import { projectCodes } from '../features/projects/domain/project-codes';
import { retention } from './retention';

export function usesManagement(): string {
  return [eosSummary(), projectCodes(), retention()].join('|');
}
