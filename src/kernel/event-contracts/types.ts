import type { DomainEvent, IntentName } from '../../domain/types';

export type EventSchemaFieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'object'
  | 'array'
  | 'unknown';

export interface EventSchemaField {
  type: EventSchemaFieldType;
  required?: boolean;
  description?: string;
  /** Allowed literal values for this field. Compared with Object.is. */
  enum?: unknown[];
  /** Nested object fields when type is "object". */
  fields?: EventPayloadSchema;
  /** Array item schema when type is "array". */
  items?: EventSchemaField;
}

export type EventPayloadSchema = Record<string, EventSchemaField>;

/**
 * Minimal Standard Schema interface (https://standardschema.dev).
 * Any zod/valibot/arktype (or other spec-compliant) schema satisfies this,
 * so Structrail stays zero-dependency while accepting the validators you already use.
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    readonly version: 1;
    readonly vendor: string;
    readonly validate: (
      value: unknown
    ) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
    readonly types?: { readonly input: Input; readonly output: Output } | undefined;
  };
}

export type StandardSchemaResult<Output> =
  | { readonly value: Output; readonly issues?: undefined }
  | { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export interface StandardSchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
}

export interface EventContract {
  intent: IntentName;
  version: string;
  schema?: EventPayloadSchema;
  /**
   * A Standard Schema validator (zod, valibot, arktype, ...) for the payload.
   * Runs in addition to `schema` when both are present. Must validate
   * synchronously — async validators produce a contract issue.
   */
  standardSchema?: StandardSchemaV1;
  owner?: string;
  rationale?: string;
  deprecated?: boolean | string;
  allowAdditionalFields?: boolean;
}

export interface EventContractIssue {
  intent: string;
  version?: string;
  field?: string;
  message: string;
}

export interface EventContractValidationResult {
  ok: boolean;
  contract?: EventContract;
  issues: EventContractIssue[];
}

export interface EventContractRegistry {
  register(contract: EventContract): void;
  get(intent: string, version?: string): EventContract | undefined;
  list(intent?: string): EventContract[];
  validate(event: DomainEvent): EventContractValidationResult;
  clear(): void;
}
