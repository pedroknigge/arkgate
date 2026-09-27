import { dispatchBoard } from '../../../../lib/features/operations/dispatch/dispatch-board';
import { fleetScreen } from '../fleet/fleet-screen';

export function dispatchScreen(): string {
  return [dispatchBoard(), fleetScreen()].join('|');
}
