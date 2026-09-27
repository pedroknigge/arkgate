import { format } from '../../../shared/format';
import { eosRepository } from '../../../repositories/features/management/eos/eos-repository';
import { eosCycle } from '../domain/eos-cycle';
import { managementUtils } from '../management-utils';

export function eosSummary(): string {
  return [format(), eosRepository(), eosCycle(), managementUtils()].join('|');
}
