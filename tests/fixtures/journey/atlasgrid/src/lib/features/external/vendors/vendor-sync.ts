import { fleetRepository } from '../../../repositories/features/operations/fleet/fleet-repository';
import { vendorRepository } from '../../../repositories/features/external/vendors/vendor-repository';
import { vendorId } from '../domain/vendor-id';
import { externalUtils } from '../external-utils';

export function vendorSync(): string {
  return [fleetRepository(), vendorRepository(), vendorId(), externalUtils()].join('|');
}
