import { portalClient } from '../../../../lib/features/external/portal/portal-client';
import { eosSummary } from '../../../../lib/features/management/eos/eos-summary';

export function eosScreen(): string {
  return [portalClient(), eosSummary()].join('|');
}
