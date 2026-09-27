import { eosScreen } from '../features/management/eos/eos-screen';

export function dialog(): string {
  return [eosScreen()].join('|');
}
