import { rfiIntake } from '../rfi/rfi-intake';

export function projectCodes(): string {
  return [rfiIntake()].join('|');
}
