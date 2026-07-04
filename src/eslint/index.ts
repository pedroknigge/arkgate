type RuleContext = {
  report(descriptor: Record<string, unknown>): void;
  getFilename?: () => string;
  options?: unknown[];
};

type RuleListener = Record<string, (node: AstNode) => void>;

type AstNode = {
  type?: string;
  name?: string;
  value?: unknown;
  source?: AstNode;
  callee?: AstNode;
  object?: AstNode;
  property?: AstNode;
  key?: AstNode;
  arguments?: AstNode[];
  properties?: AstNode[];
};

type ArkRule = {
  meta: {
    type: 'problem';
    docs: { description: string };
    messages: Record<string, string>;
    schema: unknown[];
  };
  create(context: RuleContext): RuleListener;
};

type ArkEslintPlugin = {
  rules: Record<string, ArkRule>;
  configs?: Record<string, unknown>;
};

function stringValue(node: AstNode | undefined): string | undefined {
  return typeof node?.value === 'string' ? node.value : undefined;
}

function propertyName(node: AstNode | undefined): string | undefined {
  return node?.name ?? stringValue(node);
}

function calleePropertyName(node: AstNode): string | undefined {
  return propertyName(node.callee?.property);
}

function objectProperty(node: AstNode | undefined, name: string): AstNode | undefined {
  return node?.properties?.find((property) => propertyName(property.key) === name);
}

function objectHasProperty(node: AstNode | undefined, name: string): boolean {
  return objectProperty(node, name) !== undefined;
}

function objectHasMetadataSource(node: AstNode | undefined): boolean {
  const metadata = objectProperty(node, 'metadata')?.value as AstNode | undefined;
  return objectHasProperty(metadata, 'source');
}

function looksLikeIntent(value: string): boolean {
  return /^(Domain|Application|Adapter|Workflow|Job|Presentation|Reporting|Metadata|Security|Audit|Observability|Kernel)\.[A-Za-z0-9_.]+$/.test(value);
}

function isDomainFile(context: RuleContext): boolean {
  const filename = context.getFilename?.() ?? '';
  const normalized = filename.split('\\').join('/').toLowerCase();
  return normalized.includes('/domain/') || normalized.endsWith('/domain.ts');
}

function isInfraImport(specifier: string): boolean {
  const normalized = specifier.toLowerCase();
  return [
    'adapter',
    'adapters',
    'infrastructure',
    'persistence',
    'repository',
    'repositories',
    'integration',
    'database',
    'db',
  ].some((token) => normalized.includes(token));
}

function isPublishCall(node: AstNode): boolean {
  return calleePropertyName(node) === 'publish';
}

export const noDomainInfraImports: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow importing infrastructure or adapters from domain files.',
    },
    messages: {
      forbiddenImport: 'Domain code must not import infrastructure, adapters, repositories, or database modules.',
    },
    schema: [],
  },
  create(context) {
    const check = (node: AstNode) => {
      if (!isDomainFile(context)) return;
      const source = stringValue(node.source);
      if (source && isInfraImport(source)) {
        context.report({ node, messageId: 'forbiddenImport' });
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

export const noRawEventPublish: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require event bus publish calls to use registered intent creators instead of raw event objects or intent strings.',
    },
    messages: {
      rawPublish: 'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isPublishCall(node)) return;
        const firstArg = node.arguments?.[0];
        const firstValue = stringValue(firstArg);
        if (
          firstValue && looksLikeIntent(firstValue) ||
          objectHasProperty(firstArg, 'intent')
        ) {
          context.report({ node, messageId: 'rawPublish' });
        }
      },
    };
  },
};

export const requirePublishSource: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Require event bus publish calls to include source metadata.',
    },
    messages: {
      missingSource: 'Strict Ark publish calls must include metadata.source.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isPublishCall(node)) return;
        const firstArg = node.arguments?.[0];
        const metadataArg = node.arguments?.[2];
        if (objectHasMetadataSource(firstArg) || objectHasProperty(metadataArg, 'source')) {
          return;
        }
        context.report({ node, messageId: 'missingSource' });
      },
    };
  },
};

const DEFAULT_FORBIDDEN_GLOBALS = ['fetch', 'process', 'Date.now', 'Math.random'];

export const noForbiddenGlobals: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow ambient globals (e.g. fetch, Date.now) in architecture-governed code; scope the rule to layer directories via ESLint "files" patterns.',
    },
    messages: {
      forbiddenGlobal: 'Ambient global "{{name}}" is forbidden here; inject the capability through a port instead.',
    },
    schema: [
      {
        type: 'object',
        properties: {
          globals: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const option = context.options?.[0] as { globals?: string[] } | undefined;
    const globals = new Set(option?.globals ?? DEFAULT_FORBIDDEN_GLOBALS);
    const report = (node: AstNode, name: string) =>
      context.report({ node, messageId: 'forbiddenGlobal', data: { name } });

    return {
      // Same positional detection as ark-check's FORBIDDEN_GLOBAL: property accesses on a
      // forbidden base (console.log, Date.now), direct calls, and constructions. Bare
      // identifier mentions elsewhere are not flagged (avoids shadowed-local false positives).
      MemberExpression(node) {
        const base = node.object?.type === 'Identifier' ? node.object.name : undefined;
        if (!base) return;
        const dotted = `${base}.${propertyName(node.property) ?? ''}`;
        if (globals.has(dotted)) report(node, dotted);
        else if (globals.has(base)) report(node, base);
      },
      CallExpression(node) {
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals.has(callee)) report(node, callee);
      },
      NewExpression(node) {
        const callee = node.callee?.type === 'Identifier' ? node.callee.name : undefined;
        if (callee && globals.has(callee)) report(node, callee);
      },
    };
  },
};

const rules = {
  'no-domain-infra-imports': noDomainInfraImports,
  'no-raw-event-publish': noRawEventPublish,
  'require-publish-source': requirePublishSource,
  'no-forbidden-globals': noForbiddenGlobals,
};

const plugin: ArkEslintPlugin = { rules };

plugin.configs = {
  recommended: {
    plugins: { ark: plugin },
    rules: {
      'ark/no-domain-infra-imports': 'error',
      'ark/no-raw-event-publish': 'error',
      'ark/require-publish-source': 'error',
    },
  },
};

export { plugin };
export default plugin;
