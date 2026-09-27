import { vendorSync } from '../../../../lib/features/external/vendors/vendor-sync';

export function vendorsScreen(): string {
  return [vendorSync()].join('|');
}
