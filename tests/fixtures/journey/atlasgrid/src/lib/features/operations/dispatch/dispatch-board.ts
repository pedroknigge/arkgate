import { dispatchRepository } from '../../../repositories/features/operations/dispatch/dispatch-repository';
import { dispatchWindow } from '../domain/dispatch-window';
import { operationsUtils } from '../operations-utils';

export function dispatchBoard(): string {
  return [dispatchRepository(), dispatchWindow(), operationsUtils()].join('|');
}
