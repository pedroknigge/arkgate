/**
 * GENERATED FILE — do not edit by hand.
 *
 * Canonical algorithm: src/domain/arkOrderError.ts
 * Regenerate: node scripts/generate-cli-pure.mjs
 * Drift check: node scripts/generate-cli-pure.mjs --check
 *
 * Pure CLI helper (bin/lib/ark-order-error.mjs). Zero Node I/O.
 */

export class ArkOrderError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.name = 'ArkOrderError';
        this.code = code;
    }
}
