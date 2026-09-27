import { portalRepository } from './portal-repository';

export function portalCache(): string {
  return [portalRepository()].join('|');
}
