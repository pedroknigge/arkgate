import { fleetStatus } from '../../../../lib/features/operations/fleet/fleet-status';

export function fleetScreen(): string {
  return [fleetStatus()].join('|');
}
