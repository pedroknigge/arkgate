import { portalClient } from '../../../../lib/features/external/portal/portal-client';

export function portalScreen(): string {
  return [portalClient()].join('|');
}
