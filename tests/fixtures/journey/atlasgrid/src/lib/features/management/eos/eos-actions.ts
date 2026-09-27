import { eosSummary } from './eos-summary';

export function eosActions(): string {
  return [eosSummary()].join('|');
}
