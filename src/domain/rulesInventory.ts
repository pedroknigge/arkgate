/**
 * Deterministic brownfield rules inventory (AR13).
 *
 * Scans supplied file contents for spaghetti rule candidates:
 * validation-in-controller, magic business constants, anemic entities.
 * Confidence is direct-evidence | heuristic — never a numeric score.
 */

export type RulesInventoryConfidence = 'direct-evidence' | 'heuristic';

export type RulesInventoryCandidate = {
  id: string;
  kind:
    | 'validation-in-controller'
    | 'magic-business-constant'
    | 'anemic-entity'
    | 'mutation-without-guard';
  file: string;
  line: number;
  message: string;
  confidence: RulesInventoryConfidence;
  suggestedArkRule?: {
    layer: string;
    structureId?: string;
    sensor?: string;
    invariantId?: string;
  };
  neverMechanicalSafe: true;
};

export type RulesInventoryResult = {
  candidates: RulesInventoryCandidate[];
  inventoried: number;
  underContract: number;
  frozen: number;
  notAScore: true;
};

export type BuildRulesInventoryInput = {
  fileContents: Readonly<Record<string, string>>;
  /** Invariant / structure ids already under contract (to compute underContract count). */
  contractedRuleIds?: readonly string[];
  /** Baseline keys currently frozen for arkrule residual. */
  frozenKeys?: readonly string[];
};

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split('\n').length;
}

export function buildRulesInventory(input: BuildRulesInventoryInput): RulesInventoryResult {
  const candidates: RulesInventoryCandidate[] = [];
  let seq = 0;

  for (const [file, content] of Object.entries(input.fileContents).sort(([a], [b]) =>
    a.localeCompare(b)
  )) {
    const posix = file.replace(/\\/g, '/');
    // P2-N — UI / Next surface noise (route labels, theme tokens) is not business inventory.
    const isUiSurface =
      /(?:^|\/)(?:components|ui|layouts|styles|hooks|theme|tokens|i18n|locales?)(?:\/|$)/i.test(
        posix
      ) ||
      /(?:^|\/)(?:src\/)?(?:app|pages)\/(?!api(?:\/|$))/i.test(posix);
    const isApiRoute = /(?:^|\/)(?:app|pages)\/api(?:\/|$)/i.test(posix);
    const isController =
      /controller|handler|resolver/i.test(file) ||
      isApiRoute ||
      (/route/i.test(file) && !isUiSurface) ||
      /@(Controller|Get|Post|Put|Delete|Patch)\b/.test(content);
    const isDomain = /domain|entity|aggregate|model/i.test(file);

    // validation-in-controller (API/Nest handlers — not pure UI pages)
    if (isController && !isUiSurface) {
      const valRe = /\b(if\s*\([^)]{0,80}(amount|total|price|qty|quantity|balance)[^)]{0,40}\)|throw new (Error|BadRequest|ValidationError)|z\.object\(|yup\.|class-validator|@Is[A-Z])/g;
      let m: RegExpExecArray | null;
      while ((m = valRe.exec(content)) !== null) {
        seq += 1;
        candidates.push({
          id: `inv-val-${seq}`,
          kind: 'validation-in-controller',
          file,
          line: lineOf(content, m.index),
          message: 'Business validation appears in a controller/handler — extract an invariant or Domain rule.',
          confidence: 'direct-evidence',
          suggestedArkRule: {
            layer: 'DomainModel',
            invariantId: `INV-EXTRACT-${seq}`,
            sensor: 'invariant-coverage',
          },
          neverMechanicalSafe: true,
        });
      }
    }

    // magic business constants (heuristic) — quiet UI/Next labels & infra knobs
    const magicRe = /\b(const|let)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(\d{2,}|['"][^'"]{8,}['"])/g;
    let magic: RegExpExecArray | null;
    while ((magic = magicRe.exec(content)) !== null) {
      const name = magic[2]!;
      if (
        /TEST|SPEC|TIMEOUT|PORT|VERSION|MAX_RETRY|MIN_RETRY|RETRY|DELAY|INTERVAL|TTL|CACHE|HEADER|COOKIE|MIME|CONTENT_TYPE|STATUS|HTTP|URL|URI|PATH|ROUTE|LABEL|TITLE|HEADING|CLASS|STYLE|COLOR|THEME|BREAKPOINT|QUERY|PARAM|ICON|ARIA|MSG|COPY|I18N|LOCALE|PAGE|NAV|MENU|TAB|BTN|BUTTON|PLACEHOLDER|TOOLTIP|Z_INDEX|SHADOW|RADIUS|GAP|PADDING|MARGIN|FONT|SIZE|WIDTH|HEIGHT|OPACITY|DURATION|EASE|ANIM|KEY|ID_PREFIX|FEATURE_FLAG|ENV|NODE_ENV|DEV|PROD|DEBUG|LOG_LEVEL/i.test(
          name
        )
      ) {
        continue;
      }
      // P2-N: skip remaining ALL_CAPS noise on pure UI surfaces (constants / route labels).
      if (isUiSurface && !isDomain) continue;
      seq += 1;
      candidates.push({
        id: `inv-magic-${seq}`,
        kind: 'magic-business-constant',
        file,
        line: lineOf(content, magic.index),
        message: `Magic business constant ${name} may belong in a Domain policy or invariant catalog.`,
        confidence: 'heuristic',
        suggestedArkRule: { layer: 'DomainModel', invariantId: `INV-${name}` },
        neverMechanicalSafe: true,
      });
    }

    // anemic entity
    if (isDomain) {
      const classRe = /export\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([^}]{0,800})\}/g;
      let c: RegExpExecArray | null;
      while ((c = classRe.exec(content)) !== null) {
        const body = c[2] ?? '';
        const methods = (body.match(/\b[a-zA-Z_][a-zA-Z0-9_]*\s*\(/g) ?? []).length;
        const fields = (body.match(/:\s*[A-Za-z]/g) ?? []).length;
        if (fields >= 2 && methods <= 1) {
          seq += 1;
          candidates.push({
            id: `inv-anemic-${seq}`,
            kind: 'anemic-entity',
            file,
            line: lineOf(content, c.index),
            message: `Class ${c[1]} looks anemic (data-heavy, few behaviors).`,
            confidence: 'heuristic',
            suggestedArkRule: {
              layer: 'DomainModel',
              structureId: 'no-anemic-model',
              sensor: 'no-anemic-model',
            },
            neverMechanicalSafe: true,
          });
        }
      }
    }

    // mutation without guard in domain
    if (isDomain) {
      const mutRe = /this\.\w+\s*=/g;
      let mut: RegExpExecArray | null;
      while ((mut = mutRe.exec(content)) !== null) {
        const window = content.slice(Math.max(0, mut.index - 200), mut.index + 200);
        if (!/\b(ensureInvariants|assertInvariants|validate|publish|emit)\b/.test(window)) {
          seq += 1;
          candidates.push({
            id: `inv-mut-${seq}`,
            kind: 'mutation-without-guard',
            file,
            line: lineOf(content, mut.index),
            message: 'Domain field mutation without nearby guard/publish call.',
            confidence: 'heuristic',
            suggestedArkRule: {
              layer: 'DomainModel',
              structureId: 'events-on-mutation',
              sensor: 'domain-event-on-mutation',
            },
            neverMechanicalSafe: true,
          });
          break; // one per file is enough for inventory ranking
        }
      }
    }
  }

  const contracted = new Set(input.contractedRuleIds ?? []);
  const underContract = candidates.filter(
    (c) =>
      (c.suggestedArkRule?.invariantId && contracted.has(c.suggestedArkRule.invariantId)) ||
      (c.suggestedArkRule?.structureId && contracted.has(c.suggestedArkRule.structureId))
  ).length;

  return {
    candidates,
    inventoried: candidates.length,
    underContract,
    frozen: (input.frozenKeys ?? []).length,
    notAScore: true,
  };
}

/** Build a pilotLoop extraction card for the top inventory candidate (AR14). */
export function inventoryToExtractionCard(candidate: RulesInventoryCandidate): {
  pilot: string;
  pilotTarget: string;
  smellId: string;
  move: string;
  doNot: string[];
  successSignal: string;
  killSwitch: string;
  neverMechanicalSafe: true;
  class: 'judgment';
  next: string;
} {
  return {
    pilot: `Extract rule candidate ${candidate.id} (${candidate.kind})`,
    pilotTarget: candidate.file,
    smellId: candidate.kind,
    move: `Declare in arkrules/${candidate.suggestedArkRule?.layer ?? 'DomainModel'}.json, implement pure Domain logic, add covering test.`,
    doNot: [
      'Do not auto-apply codemods',
      'Do not promote to enforced without coverage evidence',
      'Do not batch multiple extractions',
    ],
    successSignal: 'Doctor reports candidate under contract; gate green with residual honest.',
    killSwitch: 'Stop if extraction requires multi-module redesign without a clear aggregate owner.',
    neverMechanicalSafe: true,
    class: 'judgment',
    next: 'Run ark_prepare_change / preflight, then re-doctor.',
  };
}
