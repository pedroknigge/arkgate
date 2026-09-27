import { fleetRepository } from '../../../repositories/features/operations/fleet/fleet-repository';
import { fleetUnit } from '../domain/fleet-unit';
import { operationsUtils } from '../operations-utils';

export function fleetStatus(): string {
  return [fleetRepository(), fleetUnit(), operationsUtils()].join('|');
}
