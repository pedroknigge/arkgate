import type { DomainEvent } from '../../domain/types';
import type {
  EventContract,
  EventContractIssue,
  EventPayloadSchema,
  EventContractRegistry,
  EventContractValidationResult,
  EventSchemaField,
  EventSchemaFieldType,
  StandardSchemaIssue,
} from './types';

function formatStandardSchemaPath(
  path: StandardSchemaIssue['path']
): string | undefined {
  if (!path || path.length === 0) return undefined;
  return path
    .map((segment) =>
      typeof segment === 'object' && segment !== null && 'key' in segment
        ? String(segment.key)
        : String(segment)
    )
    .join('.');
}

function actualType(value: unknown): EventSchemaFieldType {
  if (Array.isArray(value)) return 'array';
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean' || type === 'object') {
    return type;
  }
  return 'unknown';
}

function formatPath(parent: string | undefined, field: string): string {
  return parent ? `${parent}.${field}` : field;
}

function validateSchemaField(
  value: unknown,
  fieldSchema: EventSchemaField,
  path: string,
  contract: EventContract,
  issues: EventContractIssue[]
): void {
  if (value === null) {
    if (fieldSchema.nullable || fieldSchema.type === 'null' || fieldSchema.type === 'unknown') {
      return;
    }
    issues.push({
      intent: contract.intent,
      version: contract.version,
      field: path,
      message: `Expected ${fieldSchema.type}, received null.`,
    });
    return;
  }

  const valueType = actualType(value);

  if (fieldSchema.type !== 'unknown' && valueType !== fieldSchema.type) {
    issues.push({
      intent: contract.intent,
      version: contract.version,
      field: path,
      message: `Expected ${fieldSchema.type}, received ${valueType}.`,
    });
    return;
  }

  if (
    fieldSchema.enum &&
    !fieldSchema.enum.some((allowed) => Object.is(allowed, value))
  ) {
    issues.push({
      intent: contract.intent,
      version: contract.version,
      field: path,
      message: 'Value is not allowed by event contract enum.',
    });
  }

  if (fieldSchema.type === 'object' && fieldSchema.fields) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      issues.push({
        intent: contract.intent,
        version: contract.version,
        field: path,
        message: 'Nested object field must be a non-array object.',
      });
      return;
    }
    validateObjectSchema(
      value as Record<string, unknown>,
      fieldSchema.fields,
      contract,
      issues,
      path
    );
  }

  if (fieldSchema.type === 'array' && fieldSchema.items && Array.isArray(value)) {
    value.forEach((item, index) => {
      validateSchemaField(
        item,
        fieldSchema.items!,
        `${path}[${index}]`,
        contract,
        issues
      );
    });
  }
}

function validateObjectSchema(
  payload: Record<string, unknown>,
  schema: EventPayloadSchema,
  contract: EventContract,
  issues: EventContractIssue[],
  parentPath?: string
): void {
  for (const [field, fieldSchema] of Object.entries(schema)) {
    const path = formatPath(parentPath, field);
    const value = payload[field];
    if (value === undefined) {
      if (fieldSchema.required) {
        issues.push({
          intent: contract.intent,
          version: contract.version,
          field: path,
          message: 'Required field is missing.',
        });
      }
      continue;
    }

    validateSchemaField(value, fieldSchema, path, contract, issues);
  }
}

export class EventContractRegistryImpl implements EventContractRegistry {
  private readonly contracts = new Map<string, EventContract>();

  register(contract: EventContract): void {
    const key = this.key(contract.intent, contract.version);
    if (this.contracts.has(key)) {
      throw new Error(`Event contract "${key}" is already registered.`);
    }
    this.contracts.set(key, { allowAdditionalFields: true, ...contract });
  }

  get(intent: string, version?: string): EventContract | undefined {
    if (version) return this.contracts.get(this.key(intent, version));
    return this.list(intent).at(-1);
  }

  list(intent?: string): EventContract[] {
    return Array.from(this.contracts.values()).filter(
      (contract) => !intent || contract.intent === intent
    );
  }

  validate(event: DomainEvent): EventContractValidationResult {
    const version = event.metadata.eventVersion;
    const contract = this.get(event.intent, version);
    const issues: EventContractIssue[] = [];
    const warnings: EventContractIssue[] = [];

    if (!contract) {
      return {
        ok: false,
        issues: [
          {
            intent: event.intent,
            version,
            message: version
              ? `No event contract registered for version "${version}".`
              : 'No event contract registered for intent.',
          },
        ],
        warnings,
      };
    }

    if (contract.deprecated) {
      warnings.push({
        intent: event.intent,
        version: contract.version,
        message:
          typeof contract.deprecated === 'string'
            ? contract.deprecated
            : 'Event contract is deprecated.',
      });
    }

    const payload =
      event.payload != null && typeof event.payload === 'object' && !Array.isArray(event.payload)
        ? (event.payload as Record<string, unknown>)
        : undefined;

    if (contract.schema) {
      if (!payload) {
        issues.push({
          intent: event.intent,
          version: contract.version,
          message: 'Payload must be an object for schema validation.',
        });
      } else {
        validateObjectSchema(payload, contract.schema, contract, issues);

        if (contract.allowAdditionalFields === false) {
          for (const field of Object.keys(payload)) {
            if (!contract.schema[field]) {
              issues.push({
                intent: event.intent,
                version: contract.version,
                field,
                message: 'Additional field is not allowed by event contract.',
              });
            }
          }
        }
      }
    }

    if (contract.standardSchema) {
      const result = contract.standardSchema['~standard'].validate(event.payload);
      if (result instanceof Promise) {
        issues.push({
          intent: event.intent,
          version: contract.version,
          message:
            'Standard Schema validator returned a Promise; event contract validation is synchronous.',
        });
      } else if (result.issues) {
        for (const issue of result.issues) {
          issues.push({
            intent: event.intent,
            version: contract.version,
            field: formatStandardSchemaPath(issue.path),
            message: issue.message,
          });
        }
      }
    }

    return { ok: issues.length === 0, contract, issues, warnings };
  }

  clear(): void {
    this.contracts.clear();
  }

  private key(intent: string, version: string): string {
    return `${intent}@${version}`;
  }
}

export function createEventContractRegistry(): EventContractRegistry {
  return new EventContractRegistryImpl();
}
