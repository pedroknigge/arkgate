import { eosSummary } from '../../features/management/eos/eos-summary';
import { dispatchBoard } from '../../features/operations/dispatch/dispatch-board';

export function registerAll(): string[] {
  return [eosSummary(), dispatchBoard()];
}
