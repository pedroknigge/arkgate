/**
 * Runtime event hygiene rules (`no-raw-event-publish`, `require-publish-source`).
 *
 * Publish-call facts follow the CLI (AICodeGate): a publish call is `x.publish(...)` or a bare
 * `publish(...)`; an Ark publish candidate has an Ark intent string, an `{ intent }` object,
 * or an intent-creator reference (`OrderPlaced`, `Events.OrderPlaced`) as first argument;
 * `source` counts in the first argument's `metadata`, or in the second or third argument.
 */
import path from 'node:path';
import { classifyPublishFacts, looksLikeArkIntent } from '../domain/sourcePolicy';
import { propertyName, staticStringValue } from './astHelpers';
import { configForRule, findConfigPath, sourceIsInAnalysisScope } from './contractLoad';
import {
  lintedFilename,
  reportAdapterDiagnostic,
  type ArkRule,
  type AstNode,
  type RuleContext,
  type RuleListener,
} from './ruleSupport';

function objectProperty(node: AstNode | undefined, name: string): AstNode | undefined {
  if (node?.type && node.type !== 'ObjectExpression') return undefined;
  return node?.properties?.find((property) => propertyName(property.key) === name);
}

function objectHasProperty(node: AstNode | undefined, name: string): boolean {
  return objectProperty(node, name) !== undefined;
}

function objectHasMetadataSource(node: AstNode | undefined): boolean {
  const metadata = objectProperty(node, 'metadata')?.value as AstNode | undefined;
  return objectHasProperty(metadata, 'source');
}

function isPublishCall(node: AstNode): boolean {
  const callee = node.callee;
  if (callee?.type === 'Identifier') return callee.name === 'publish';
  return callee?.computed !== true && propertyName(callee?.property) === 'publish';
}

/** Mirrors tsLooksLikeIntentCreatorExpression: PascalCase identifier / property access. */
function looksLikeIntentCreator(node: AstNode | undefined): boolean {
  if (!node) return false;
  if (node.type === 'Identifier' || (node.type === undefined && node.name)) {
    return /^[A-Z]/.test(node.name ?? '');
  }
  if (node.type === 'MemberExpression' && node.computed !== true) {
    return looksLikeIntentCreator(node.property);
  }
  return false;
}

function isArkPublishCandidate(firstArg: AstNode | undefined): boolean {
  const raw = staticStringValue(firstArg);
  return (
    (raw !== undefined && looksLikeArkIntent(raw)) ||
    objectHasProperty(firstArg, 'intent') ||
    looksLikeIntentCreator(firstArg)
  );
}

function publishHasSource(args: AstNode[]): boolean {
  const [first, second, third] = args;
  return (
    objectHasMetadataSource(first) ||
    objectHasProperty(second, 'source') ||
    objectHasProperty(third, 'source')
  );
}

/** Project-relative path when an Ark contract applies to this file and it is in scope. */
function scopedFile(context: RuleContext): string | null {
  const filename = lintedFilename(context);
  const configPath = findConfigPath(filename);
  const config = configForRule(configPath);
  if (!config || !configPath || !filename) return null;
  const relFile = path
    .relative(path.dirname(configPath), path.resolve(filename))
    .split(path.sep)
    .join('/');
  return sourceIsInAnalysisScope(config, relFile) ? relFile : null;
}

export const noRawEventPublish: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require event bus publish calls to use registered intent creators instead of raw event objects or intent strings.',
    },
    messages: {
      rawPublish:
        'Publish through a registered intent creator; raw event objects or intent strings bypass Ark contracts.',
    },
    schema: [],
  },
  create(context) {
    return {
      CallExpression(node) {
        const firstArg = node.arguments?.[0];
        const findings = classifyPublishFacts({
          publishCall: isPublishCall(node),
          rawIntentName: staticStringValue(firstArg),
          objectHasIntent: objectHasProperty(firstArg, 'intent'),
          arkPublishCandidate: false,
          hasSource: true,
        });
        const finding = findings.find((item) => item.ruleId === 'RAW_EVENT_PUBLISH');
        if (finding) {
          reportAdapterDiagnostic(context, node, 'rawPublish', {
            ...finding,
            file: lintedFilename(context),
          });
        }
      },
    };
  },
};

export const requirePublishSource: ArkRule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require Ark publish calls (intent creator / Ark intent first argument) to include source metadata. Silent without an ark.config.json or outside its include scope, like ark-check.',
    },
    messages: {
      missingSource: 'Strict Ark publish calls must include metadata.source.',
    },
    schema: [],
  },
  create(context) {
    const relFile = scopedFile(context);
    if (!relFile) return {} as RuleListener;
    return {
      CallExpression(node) {
        const args = node.arguments ?? [];
        const firstArg = args[0];
        const findings = classifyPublishFacts({
          publishCall: isPublishCall(node),
          rawIntentName: staticStringValue(firstArg),
          objectHasIntent: objectHasProperty(firstArg, 'intent'),
          arkPublishCandidate: isArkPublishCandidate(firstArg),
          hasSource: publishHasSource(args),
        });
        const finding = findings.find((item) => item.ruleId === 'PUBLISH_MISSING_SOURCE');
        if (finding) {
          reportAdapterDiagnostic(context, node, 'missingSource', { ...finding, file: relFile });
        }
      },
    };
  },
};
