/**
 * Host PreToolUse payload mapping (Claude/Grok/Cursor/Antigravity/Codex).
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * Map Google Antigravity write tools (PascalCase args) onto Claude Write/Edit/MultiEdit.
 * @returns {{ toolName: string, toolInput: object }|null}
 */
export function mapAntigravityToolCall(toolCall) {
  if (!toolCall || typeof toolCall !== 'object') return null;
  const name = toolCall.name ?? '';
  const args = toolCall.args && typeof toolCall.args === 'object' ? toolCall.args : {};
  const filePath = args.TargetFile ?? args.targetFile ?? args.file_path ?? args.path;
  if (name === 'write_to_file') {
    return {
      toolName: 'Write',
      toolInput: {
        file_path: filePath,
        content: args.CodeContent ?? args.codeContent ?? args.content ?? '',
      },
      operation: 'write_to_file',
    };
  }
  if (name === 'replace_file_content') {
    return {
      toolName: 'Edit',
      toolInput: {
        file_path: filePath,
        old_string: args.TargetContent ?? args.targetContent ?? args.old_string ?? '',
        new_string: args.ReplacementContent ?? args.replacementContent ?? args.new_string ?? '',
        replace_all: Boolean(args.AllowMultiple ?? args.allowMultiple),
      },
      operation: 'replace_file_content',
    };
  }
  if (name === 'multi_replace_file_content') {
    const chunks = Array.isArray(args.ReplacementChunks)
      ? args.ReplacementChunks
      : Array.isArray(args.replacementChunks)
        ? args.replacementChunks
        : [];
    return {
      toolName: 'MultiEdit',
      toolInput: {
        file_path: filePath,
        edits: chunks.map((chunk) => ({
          old_string: chunk?.TargetContent ?? chunk?.targetContent ?? chunk?.old_string ?? '',
          new_string:
            chunk?.ReplacementContent ?? chunk?.replacementContent ?? chunk?.new_string ?? '',
          replace_all: Boolean(chunk?.AllowMultiple ?? chunk?.allowMultiple),
        })),
      },
      operation: 'multi_replace_file_content',
    };
  }
  return {
    toolName: name,
    toolInput: { ...args, file_path: filePath },
    operation: name,
  };
}

/**
 * Normalize agent PreToolUse payloads.
 * Claude Code: { tool_name, tool_input: { file_path, content | old_string/new_string } }
 * Grok Build:  { toolName, toolInput:  { file_path, content | old_string/new_string } }
 *              (aliases Write/Edit/MultiEdit → write/search_replace; matcher keeps both)
 * Antigravity: { toolCall: { name, args: { TargetFile, CodeContent, … } } }
 * Cursor:      { tool_name, tool_input, hook_event_name?, workspace_roots? }
 *              Write uses `contents`; StrReplace maps to Edit (path/old_string/new_string).
 * Codex:       { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch..." } }
 */
export function normalizeHookPayload(payload, grokHookEvent = Boolean(process.env.GROK_HOOK_EVENT)) {
  const antigravityStyle =
    payload != null && typeof payload === 'object' && 'toolCall' in payload;
  if (antigravityStyle) {
    const mapped = mapAntigravityToolCall(payload.toolCall);
    const filePath =
      mapped?.toolInput?.file_path ??
      mapped?.toolInput?.filePath ??
      mapped?.toolInput?.path ??
      mapped?.toolInput?.target_file;
    return {
      toolName: mapped?.toolName ?? '',
      toolInput: { ...(mapped?.toolInput ?? {}), file_path: filePath },
      grokStyle: true, // decision JSON on stdout (deny)
      antigravityStyle: true,
      cursorStyle: false,
      operation: mapped?.operation ?? mapped?.toolName ?? null,
    };
  }

  const rawName = payload?.tool_name ?? payload?.toolName ?? '';
  const toolInputRaw = payload?.tool_input ?? payload?.toolInput ?? {};
  const toolInput =
    toolInputRaw && typeof toolInputRaw === 'object' ? { ...toolInputRaw } : {};
  // Cursor Write uses `contents`; Claude/Grok use `content`.
  if (toolInput.content == null && typeof toolInput.contents === 'string') {
    toolInput.content = toolInput.contents;
  }
  const nameMap = {
    Write: 'Write',
    write: 'Write',
    Edit: 'Edit',
    search_replace: 'Edit',
    StrReplace: 'Edit',
    MultiEdit: 'MultiEdit',
    ApplyPatch: 'ApplyPatch',
    apply_patch: 'ApplyPatch',
    write_to_file: 'Write',
    replace_file_content: 'Edit',
    multi_replace_file_content: 'MultiEdit',
  };
  const toolName = nameMap[rawName] ?? rawName;
  const filePath =
    toolInput.file_path ?? toolInput.filePath ?? toolInput.path ?? toolInput.target_file;
  const cursorStyle =
    Boolean(process.env.CURSOR_PROJECT_DIR) ||
    Boolean(process.env.CURSOR_VERSION) ||
    (payload != null &&
      typeof payload === 'object' &&
      (payload.hook_event_name === 'preToolUse' ||
        Array.isArray(payload.workspace_roots) ||
        rawName === 'StrReplace' ||
        (rawName === 'Write' && typeof toolInputRaw?.contents === 'string')));
  return {
    toolName,
    toolInput: { ...toolInput, file_path: filePath },
    // Grok-style camelCase (or GROK_HOOK_EVENT) → also emit deny JSON on stdout.
    grokStyle:
      grokHookEvent ||
      (payload != null && typeof payload === 'object' && 'toolName' in payload),
    antigravityStyle: false,
    cursorStyle,
    operation: rawName === 'StrReplace' ? 'StrReplace' : null,
  };
}

/** Realpath of the nearest existing ancestor plus the missing tail (never throws). */
export function canonicalPathLoose(candidate) {
  const absolute = path.resolve(candidate);
  let existing = absolute;
  const missing = [];
  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) return absolute;
    missing.unshift(path.basename(existing));
    existing = parent;
  }
  try {
    return path.join(fs.realpathSync(existing), ...missing);
  } catch {
    return absolute;
  }
}

function relativeInside(root, candidate) {
  const relative = path.relative(root, candidate);
  if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`)) return null;
  if (path.isAbsolute(relative)) return null;
  return relative;
}

/**
 * Project-relative path when `filePath` is inside `root` under the caller's spelling
 * or, failing that, the canonical (realpath) spelling — /tmp vs /private/tmp, a
 * symlinked checkout. Null only when the path is truly outside the root.
 */
export function relativeToHookRoot(root, filePath) {
  const absolute = path.resolve(root, filePath);
  const direct = relativeInside(path.resolve(root), absolute);
  if (direct !== null) return direct;
  return relativeInside(canonicalPathLoose(root), canonicalPathLoose(absolute));
}

const CODEX_FILE_DIRECTIVE = /^\*\*\* (Add|Update|Delete) File: (.+)$/;
const CODEX_MOVE_DIRECTIVE = /^\*\*\* Move to: (.+)$/;
const CODEX_END_OF_FILE = '*** End of File';

/** Codex-style sequence seek: exact, then trailing-whitespace, then trimmed match. */
function seekSequence(source, pattern, start, eof) {
  if (pattern.length === 0) return start;
  if (pattern.length > source.length) return -1;
  const normalizers = [(line) => line, (line) => line.trimEnd(), (line) => line.trim()];
  const lastStart = source.length - pattern.length;
  for (const normalize of normalizers) {
    const matchesAt = (at) =>
      pattern.every((line, index) => normalize(source[at + index]) === normalize(line));
    if (eof && lastStart >= start && matchesAt(lastStart)) return lastStart;
    for (let at = start; at <= lastStart; at += 1) {
      if (matchesAt(at)) return at;
    }
  }
  return -1;
}

/**
 * Parse one Update File body into chunks. The first chunk may omit its `@@` header;
 * `*** End of File` may close a chunk; a bare empty line is an empty context line.
 * Returns null for any line outside the Codex apply_patch grammar.
 */
export function parseCodexUpdateChunks(lines) {
  const body = [...lines];
  while (body.length > 0 && body[body.length - 1] === '') body.pop();
  const chunks = [];
  let chunk = null;
  for (let index = 0; index < body.length; index += 1) {
    const line = body[index];
    if (line.startsWith('@@')) {
      if (chunk) chunks.push(chunk);
      chunk = { anchor: line.slice(2).trim(), entries: [], eof: false };
      continue;
    }
    if (line === CODEX_END_OF_FILE) {
      const next = body[index + 1];
      if (!chunk || chunk.entries.length === 0 || (next !== undefined && !next.startsWith('@@'))) {
        return null;
      }
      chunk.eof = true;
      continue;
    }
    if (line === '' || /^[ +\-]/.test(line)) {
      if (!chunk) {
        // Only the FIRST chunk may omit `@@` (implicit, anchorless).
        if (chunks.length > 0) return null;
        chunk = { anchor: '', entries: [], eof: false };
      }
      if (chunk.eof) return null;
      chunk.entries.push(line === '' ? ' ' : line);
      continue;
    }
    return null;
  }
  if (chunk) chunks.push(chunk);
  if (chunks.length === 0 || chunks.some((entry) => entry.entries.length === 0)) return null;
  return chunks;
}

export function applyCodexUpdatePatch(current, lines) {
  const chunks = parseCodexUpdateChunks(lines);
  if (!chunks) return null;
  const source = current.split('\n');
  // Codex matches against the file's lines without the final newline's empty tail.
  if (source.length > 0 && source[source.length - 1] === '') source.pop();
  let cursor = 0;
  for (const { anchor, entries, eof } of chunks) {
    if (anchor) {
      const anchorAt = seekSequence(source, [anchor], cursor, false);
      if (anchorAt < 0) return null;
      cursor = anchorAt + 1;
    }
    const oldLines = entries.filter((line) => !line.startsWith('+')).map((line) => line.slice(1));
    const newLines = entries.filter((line) => !line.startsWith('-')).map((line) => line.slice(1));
    let found;
    if (oldLines.length === 0) {
      // Pure insertion lands at the end of the file (Codex semantics).
      found = source.length;
    } else {
      found = seekSequence(source, oldLines, cursor, eof);
      if (found < 0) return null;
    }
    source.splice(found, oldLines.length, ...newLines);
    cursor = found + newLines.length;
  }
  return `${source.join('\n')}\n`;
}

function codexPatchTarget(root, rawPath) {
  const relative = relativeToHookRoot(root, rawPath.trim());
  if (relative === null) return null;
  return {
    filePath: path.resolve(root, relative),
    path: relative.split(path.sep).join('/'),
  };
}

export function codexPatchWrites(patch, root) {
  if (typeof patch !== 'string') {
    return { writes: [], complete: false };
  }
  const lines = patch.replace(/\r\n/g, '\n').split('\n');
  const begin = lines.findIndex((line) => line.trim() === '*** Begin Patch');
  const end = lines.findIndex((line, index) => index > begin && line.trim() === '*** End Patch');
  if (begin < 0 || end <= begin) return { writes: [], complete: false };
  const writes = [];
  const seenPaths = new Set();
  let complete = [
    ...lines.slice(0, begin),
    ...lines.slice(end + 1),
  ].every((line) => line.trim() === '');
  let sawFileDirective = false;
  for (let index = begin + 1; index < end; index += 1) {
    const match = lines[index].match(CODEX_FILE_DIRECTIVE);
    if (!match) {
      if (lines[index].trim() !== '') complete = false;
      continue;
    }
    sawFileDirective = true;
    const [, action, relativePath] = match;
    let moveTo = null;
    if (action === 'Update') {
      const move = (lines[index + 1] ?? '').match(CODEX_MOVE_DIRECTIVE);
      if (move) {
        moveTo = move[1];
        index += 1;
      }
    }
    const body = [];
    // Hunk bodies end only at the next file directive or End Patch — never at
    // `*** End of File`, which belongs to the hunk grammar.
    for (index += 1; index < end && !CODEX_FILE_DIRECTIVE.test(lines[index]); index += 1) {
      body.push(lines[index]);
    }
    index -= 1;
    const target = codexPatchTarget(root, relativePath);
    if (!target || seenPaths.has(target.filePath)) {
      complete = false;
      continue;
    }
    seenPaths.add(target.filePath);
    const { filePath, path: canonicalRelativePath } = target;
    if (action === 'Delete') {
      if (body.some((line) => line.trim() !== '') || !fs.existsSync(filePath)) {
        complete = false;
        continue;
      }
      writes.push({ path: canonicalRelativePath, filePath, delete: true });
      continue;
    }
    if (action === 'Add') {
      const addBody = [...body];
      while (addBody.length > 0 && addBody[addBody.length - 1] === '') addBody.pop();
      if (
        addBody.length === 0 ||
        fs.existsSync(filePath) ||
        addBody.some((line) => !line.startsWith('+'))
      ) {
        complete = false;
        continue;
      }
      const content = `${addBody.map((line) => line.slice(1)).join('\n')}\n`;
      writes.push({ path: canonicalRelativePath, filePath, content });
      continue;
    }
    let current;
    try {
      current = fs.readFileSync(filePath, 'utf8');
    } catch {
      complete = false;
      continue;
    }
    const content = applyCodexUpdatePatch(current, body);
    if (content === null) {
      complete = false;
      continue;
    }
    if (moveTo === null) {
      writes.push({ path: canonicalRelativePath, filePath, content });
      continue;
    }
    // `*** Move to:` — judge the patched content at its destination, delete the source.
    const destination = codexPatchTarget(root, moveTo);
    if (!destination) {
      complete = false;
      continue;
    }
    if (destination.filePath === filePath) {
      writes.push({ path: canonicalRelativePath, filePath, content });
      continue;
    }
    if (seenPaths.has(destination.filePath) || fs.existsSync(destination.filePath)) {
      complete = false;
      continue;
    }
    seenPaths.add(destination.filePath);
    writes.push({ path: destination.path, filePath: destination.filePath, content });
    writes.push({ path: canonicalRelativePath, filePath, delete: true });
  }
  return { writes, complete: complete && sawFileDirective };
}

/**
 * Compute the file content a Write/Edit/MultiEdit is about to produce. Edits are applied
 * to the CURRENT on-disk file so the gate judges the real post-edit state, not the edit
 * snippet out of context. Replacement uses a function argument so `$&`-style sequences in
 * generated code are inserted literally, never interpreted as replacement patterns.
 */
export function proposedSource(toolName, toolInput) {
  if (toolName === 'Write') return toolInput.content ?? toolInput.contents;

  let text = '';
  try {
    text = fs.readFileSync(toolInput.file_path, 'utf8');
  } catch {
    // New file created via Edit: fall through with an empty base.
  }
  const edits = toolName === 'MultiEdit' ? toolInput.edits ?? [] : [toolInput];
  for (const edit of edits) {
    const from = edit.old_string ?? '';
    const to = edit.new_string ?? '';
    if (from === '') {
      text = to;
    } else if (edit.replace_all) {
      text = text.split(from).join(to);
    } else {
      text = text.replace(from, () => to);
    }
  }
  return text;
}

/** Antigravity PreToolUse requires stdout `decision` on every response (allow included). */
export function emitAntigravityAllow(output, antigravityStyle) {
  if (!antigravityStyle) return;
  output.stdout(`${JSON.stringify({ decision: 'allow' })}\n`);
}

/** Cursor preToolUse accepts explicit allow; exit 0 alone also works. */
export function emitCursorAllow(output, cursorStyle) {
  if (!cursorStyle) return;
  output.stdout(`${JSON.stringify({ permission: 'allow' })}\n`);
}

export function emitHostAllow(output, { antigravityStyle, cursorStyle }) {
  emitAntigravityAllow(output, antigravityStyle);
  emitCursorAllow(output, cursorStyle);
}

/** Host-native deny envelopes. Exit 2 is still set by the caller. */
export function emitHostDeny(output, { antigravityStyle, cursorStyle, grokStyle, message, file }) {
  const text = String(message || '').endsWith('\n') ? String(message) : `${message}\n`;
  output.stderr(text);
  if (antigravityStyle || grokStyle) {
    output.stdout(`${JSON.stringify({ decision: 'deny', reason: String(message || '').trim() })}\n`);
  }
  if (cursorStyle) {
    output.stdout(
      JSON.stringify({
        permission: 'deny',
        agent_message: String(message || '').trim(),
        user_message: `ArkGate blocked write to ${file || 'this file'}`,
      }) + '\n'
    );
  }
}

/** File-local twin of CONFIG_UNCLASSIFIED_FILES — included, no layer, write must not land. */
export function unclassifiedIncludedWriteDeny(relativePath) {
  const file = String(relativePath || 'this file');
  return {
    ruleId: 'CONFIG_UNCLASSIFIED_FILES',
    message: `${file} is included but matches no layer, so import rules will not run on it.`,
    nextAction:
      'Put it in a layer folder with /ark-place, or extend layer patterns / narrow include.',
  };
}

/** File-local twin of CONFIG_LAYER_MISSING_OWNER — required owners, this house has none. */
export function unownedLayerWriteDeny(relativePath, layerName) {
  const file = String(relativePath || 'this file');
  const house = String(layerName || 'this layer');
  return {
    ruleId: 'CONFIG_LAYER_MISSING_OWNER',
    message: `${file} is in ${house}, and that folder has no owner.`,
    nextAction: `Add a GitHub handle or email to ${house}'s owners in ark.config.json (/ark-adopt).`,
  };
}

/**
 * Fail-closed write when requireLayerOwners is on and this house has no owners.
 * Silent when the flag is off, the layer is reserved, or owners are present.
 */
export function requiredOwnerWriteDeny(config, layerName, relativePath) {
  if (config?.requireLayerOwners !== true || !layerName) return null;
  const layer = (config.layers ?? []).find((entry) => entry?.name === layerName);
  if (!layer) return null;
  if (layer.optional === true || layer.reserved === true || layer.allowEmpty === true) return null;
  const owners = Array.isArray(layer.owners)
    ? layer.owners.filter((entry) => typeof entry === 'string' && entry.length > 0)
    : [];
  if (owners.length > 0) return null;
  return unownedLayerWriteDeny(relativePath, layerName);
}

/**
 * Socket-style write-gate deny: two lines first. Pass/fail, no score.
 * Rule id stays on a following line, not the first sentence.
 */
export function formatWriteGateDeny({ file, reason, ruleId, nextAction, extraLines = [] }) {
  const target = file || 'this write';
  const why = String(reason || 'a bad import — the write doesn’t land').replace(/\s+/g, ' ').trim();
  // Import-plane denies keep the short "move / place" line unless the rule's own action
  // already says that. Extra planes (ArkRules, ArkRun, ArkOrder, invariants, gate
  // availability) are not import problems: their catalog action is the only right one.
  const extraPlane = /^(ARKRULE_|ARKRUN_|ARKORDER_|INVARIANT_|WRITE_GATE_)/.test(String(ruleId ?? ''));
  const next =
    nextAction && (extraPlane || /place|move|import|port/i.test(nextAction))
      ? nextAction
      : 'Move the import or run /ark-place. Do not weaken ark.config.json.';
  const lines = [`blocked ${target} — ${why}`, `Next: ${next}`];
  if (ruleId) lines.push(`[${ruleId}]`);
  for (const extra of extraLines) {
    if (extra) lines.push(extra);
  }
  return lines.join('\n');
}

/**
 * Fail-closed envelope for the one-shot PreToolUse hook (`ark-mcp --hook`).
 *
 * Claude Code, Grok Build, and Codex treat any exit code other than 2 as a
 * non-blocking error: the write lands. When the write gate itself cannot run
 * (ark.config.json missing / unparsable / invalid, a referenced ArkRules file
 * missing, dist/ missing or broken), exiting 1 would silently turn the hard
 * write gate off. "No checker, no write": governed source writes are denied
 * with the host's blocking contract instead.
 *
 * Plumbing cases stay fail-open, exactly like the healthy hook: no stdin or a
 * malformed payload, non-file tools, non-source files (so ark.config.json itself
 * can still be repaired), files outside the root, and node_modules.
 *
 * This section (like the whole module) must not import dist/ or the MCP runtime — it runs precisely when
 * those are the broken part.
 */
const FAIL_CLOSED_SOURCE_FILE = /\.[cm]?[jt]sx?$/;
const PATCH_FILE_DIRECTIVE = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/;
const PATCH_MOVE_DIRECTIVE = /^\*\*\* Move to: (.+)$/;

/** Same root resolution as the runtime: --root, then the first non-empty --root-env var. */
export function hookRootFromArgv(argv, env = process.env, cwd = process.cwd()) {
  let root = cwd;
  const rootEnv = [];
  for (let index = 2; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--root' && argv[index + 1]) root = path.resolve(argv[++index]);
    else if (value === '--root-env' && argv[index + 1]) {
      rootEnv.push(
        ...String(argv[++index])
          .split(',')
          .map((name) => name.trim())
          .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
      );
    }
  }
  for (const name of rootEnv) {
    const value = env[name];
    if (typeof value === 'string' && value.trim() !== '') return path.resolve(value.trim());
  }
  return root;
}

function hookArgvConfig(argv) {
  let config = 'ark.config.json';
  let explicit = false;
  for (let index = 2; index < argv.length; index += 1) {
    if (argv[index] === '--config' && argv[index + 1]) {
      config = argv[++index];
      explicit = true;
    }
  }
  return { config, explicit };
}

function walkUpForConfig(start, config) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, config))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Hook project root. A set `--root-env` variable or a root that already holds the
 * config wins (the runtime's own resolution). Otherwise — the host ran the hook from a
 * subdirectory, or the env var is unset — walk up from the payload (each written file,
 * then `cwd`, then `workspace_roots`, then the argv root) to the nearest config, the
 * way `ark-check` walks up.
 * `configFound: false` means the write is not inside any Ark project.
 * @returns {{ root: string, configFound: boolean, configExplicit: boolean, source: string }}
 */
export function discoverHookRoot({
  argv,
  hookInput,
  env = process.env,
  cwd = process.cwd(),
  grokHookEvent = Boolean(process.env.GROK_HOOK_EVENT),
}) {
  const base = hookRootFromArgv(argv, env, cwd);
  const { config, explicit } = hookArgvConfig(argv);
  const result = (root, configFound, source) => ({
    root,
    configFound,
    configExplicit: explicit,
    source,
  });
  if (path.isAbsolute(config)) return result(base, fs.existsSync(config), 'argv');
  if (fs.existsSync(path.join(base, config))) return result(base, true, 'argv');
  let payload;
  try {
    payload = JSON.parse(hookInput ?? '');
  } catch {
    payload = undefined;
  }
  const payloadCwd =
    payload && typeof payload.cwd === 'string' && payload.cwd.trim() ? payload.cwd.trim() : null;
  const starts = [];
  if (payload && typeof payload === 'object') {
    const targets = hookPayloadTargets(normalizeHookPayload(payload, grokHookEvent)) ?? [];
    for (const target of targets) {
      if (typeof target !== 'string' || !target) continue;
      starts.push(path.dirname(path.resolve(payloadCwd ?? base, target)));
    }
    if (payloadCwd) starts.push(path.resolve(payloadCwd));
    for (const workspace of Array.isArray(payload.workspace_roots) ? payload.workspace_roots : []) {
      if (typeof workspace === 'string' && workspace.trim()) starts.push(path.resolve(workspace));
    }
  }
  starts.push(base);
  for (const start of starts) {
    const found = walkUpForConfig(start, config);
    if (found) return result(found, true, 'payload');
  }
  return result(base, false, 'none');
}

/**
 * The write is outside any Ark project (no config found from the hook root or the
 * payload): ArkGate does not govern it, so the hook allows it.
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function hookOutsideArkProjectResponse({ hookInput, config = 'ark.config.json', grokHookEvent }) {
  let stdout = '';
  let payload;
  try {
    payload = JSON.parse(hookInput ?? '');
  } catch {
    return { status: 0, stdout, stderr: '' };
  }
  emitHostAllow(
    { stdout: (value) => { stdout += value; }, stderr: () => {} },
    normalizeHookPayload(payload, grokHookEvent)
  );
  return {
    status: 0,
    stdout,
    stderr: `[ark-mcp] no ${config} found for this write; ArkGate does not govern it.\n`,
  };
}

function patchTargets(patch) {
  if (typeof patch !== 'string') return [];
  const targets = [];
  for (const line of patch.split('\n')) {
    const match = line.match(PATCH_FILE_DIRECTIVE) ?? line.match(PATCH_MOVE_DIRECTIVE);
    if (match) targets.push(match[1].trim());
  }
  return targets;
}

/** File paths the hook payload would write, or null for non-file tools. */
export function hookPayloadTargets(normalized) {
  const { toolName, toolInput } = normalized;
  if (toolName === 'ApplyPatch') {
    return patchTargets(
      toolInput.command ?? toolInput.patch ?? toolInput.input ?? toolInput.content
    );
  }
  if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) return null;
  return typeof toolInput.file_path === 'string' ? [toolInput.file_path] : [];
}

function isGovernedCandidate(root, target) {
  if (!FAIL_CLOSED_SOURCE_FILE.test(target) || target.endsWith('.d.ts')) return false;
  const relative = relativeToHookRoot(root, target);
  if (relative === null) return false;
  return !relative.split(path.sep).includes('node_modules');
}

/**
 * Map an internal hook failure onto the host's blocking contract.
 * @returns {{ status: number, stdout: string, stderr: string }}
 */
export function hookFailClosedResponse({ hookInput, error, root, grokHookEvent }) {
  let stdout = '';
  let stderr = '';
  const output = {
    stdout: (value) => {
      stdout += value;
    },
    stderr: (value) => {
      stderr += value;
    },
  };
  let payload;
  try {
    payload = JSON.parse(hookInput ?? '');
  } catch {
    // Same as the healthy hook: no stdin / malformed payload never blocks.
    return { status: 0, stdout, stderr };
  }
  const normalized = normalizeHookPayload(payload, grokHookEvent);
  const targets = hookPayloadTargets(normalized);
  const governed = (targets ?? []).filter((target) => isGovernedCandidate(root, target));
  if (governed.length === 0) {
    emitHostAllow(output, normalized);
    return { status: 0, stdout, stderr };
  }
  const reason = error instanceof Error ? error.message : String(error);
  const relative = relativeToHookRoot(root, governed[0]) ?? governed[0];
  const file = String(relative).split(path.sep).join('/');
  const message = formatWriteGateDeny({
    file,
    reason: `ArkGate write gate could not run: ${reason}`,
    ruleId: 'WRITE_GATE_UNAVAILABLE',
    nextAction:
      'Fix ark.config.json (or the ArkRules file it references), or run npm run build / reinstall arkgate from npm, then retry this write. No checker, no write — do not remove the hook to get past it.',
  });
  emitHostDeny(output, { ...normalized, message, file });
  return { status: 2, stdout, stderr };
}
