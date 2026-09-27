import { portalClient } from '../features/external/portal/portal-client';

export function ids(): string {
  return [portalClient()].join('|');
}
