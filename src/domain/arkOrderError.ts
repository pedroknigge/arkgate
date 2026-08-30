import type { ArkOrderErrorCode } from './arkOrderTypes';

/** Domain error for Haken plane fail-closed paths. Not a gate diagnostic. */
export class ArkOrderError extends Error {
  readonly code: ArkOrderErrorCode;

  constructor(code: ArkOrderErrorCode, message: string) {
    super(message);
    this.name = 'ArkOrderError';
    this.code = code;
  }
}
