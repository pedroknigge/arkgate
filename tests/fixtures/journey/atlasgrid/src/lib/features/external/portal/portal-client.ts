import { portalRepository } from '../../../repositories/features/external/portal/portal-repository';
import { portalSession } from '../domain/portal-session';
import { externalUtils } from '../external-utils';

export function portalClient(): string {
  return [portalRepository(), portalSession(), externalUtils()].join('|');
}
