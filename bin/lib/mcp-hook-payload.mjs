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

export function applyCodexUpdatePatch(current, lines) {
  let source = current.split('\n');
  let cursor = 0;
  const hunks = [];
  let hunk = null;
  for (const line of lines) {
    if (line.startsWith('@@')) {
      if (hunk) hunks.push(hunk);
      hunk = { anchor: line.slice(2).trim(), entries: [] };
    } else if (/^[ +\-]/.test(line)) {
      if (!hunk) return null;
      hunk.entries.push(line);
    }
  }
  if (hunk) hunks.push(hunk);
  for (const { anchor, entries } of hunks) {
    if (anchor) {
      const anchorAt = source.findIndex((line, index) => index >= cursor && line === anchor);
      if (anchorAt < 0) return null;
      cursor = anchorAt + 1;
    }
    const oldLines = entries.filter((line) => !line.startsWith('+')).map((line) => line.slice(1));
    const newLines = entries.filter((line) => !line.startsWith('-')).map((line) => line.slice(1));
    let found = -1;
    for (let at = cursor; at <= source.length - oldLines.length; at += 1) {
      if (oldLines.every((line, index) => source[at + index] === line)) {
        found = at;
        break;
      }
    }
    if (found < 0) return null;
    source.splice(found, oldLines.length, ...newLines);
    cursor = found + newLines.length;
  }
  return source.join('\n');
}

export function codexPatchWrites(patch, root) {
  if (typeof patch !== 'string') {
    return { writes: [], complete: false };
  }
  const lines = patch.split('\n');
  const begin = lines.indexOf('*** Begin Patch');
  const end = lines.indexOf('*** End Patch', begin + 1);
  if (begin < 0 || end <= begin) return { writes: [], complete: false };
  const writes = [];
  const seenPaths = new Set();
  let complete = [
    ...lines.slice(0, begin),
    ...lines.slice(end + 1),
  ].every((line) => line.trim() === '');
  let sawFileDirective = false;
  for (let index = begin + 1; index < end; index += 1) {
    const match = lines[index].match(/^\*\*\* (Add|Update|Delete) File: (.+)$/);
    if (!match) {
      if (lines[index].trim() !== '') complete = false;
      continue;
    }
    sawFileDirective = true;
    const [, action, relativePath] = match;
    const body = [];
    for (index += 1; index < end && !lines[index].startsWith('*** '); index += 1) {
      body.push(lines[index]);
    }
    index -= 1;
    const filePath = path.resolve(root, relativePath);
    const rel = path.relative(root, filePath);
    if (
      seenPaths.has(filePath) ||
      rel.startsWith(`..${path.sep}`) ||
      rel === '..' ||
      path.isAbsolute(rel)
    ) {
      complete = false;
      continue;
    }
    seenPaths.add(filePath);
    const canonicalRelativePath = rel.split(path.sep).join('/');
    if (action === 'Delete') {
      if (body.some((line) => line.trim() !== '') || !fs.existsSync(filePath)) {
        complete = false;
        continue;
      }
      writes.push({ path: canonicalRelativePath, filePath, delete: true });
      continue;
    }
    let content;
    if (action === 'Add') {
      if (
        body.length === 0 ||
        fs.existsSync(filePath) ||
        body.some((line) => !line.startsWith('+'))
      ) {
        complete = false;
        continue;
      }
      content = body.filter((line) => line.startsWith('+')).map((line) => line.slice(1)).join('\n');
      if (body.some((line) => line.startsWith('+'))) content += '\n';
    } else {
      if (
        !body.some((line) => line.startsWith('@@')) ||
        body.some((line) => !line.startsWith('@@') && !/^[ +\-]/.test(line))
      ) {
        complete = false;
        continue;
      }
      let current;
      try {
        current = fs.readFileSync(filePath, 'utf8');
      } catch {
        complete = false;
        continue;
      }
      content = applyCodexUpdatePatch(current, body);
      if (content === null) complete = false;
    }
    if (typeof content === 'string') {
      writes.push({ path: canonicalRelativePath, filePath, content });
    }
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

/**
 * Socket-style write-gate deny: two lines first. Pass/fail, no score.
 * Rule id stays on a following line, not the first sentence.
 */
export function formatWriteGateDeny({ file, reason, ruleId, nextAction, extraLines = [] }) {
  const target = file || 'this write';
  const why = String(reason || 'this change breaks the architecture layers').replace(/\s+/g, ' ').trim();
  const next =
    nextAction && /place|move|import|port/i.test(nextAction)
      ? nextAction
      : 'Move the import or run /ark-place. Do not weaken ark.config.json.';
  const lines = [`blocked ${target} — ${why}`, `Next: ${next}`];
  if (ruleId) lines.push(`[${ruleId}]`);
  for (const extra of extraLines) {
    if (extra) lines.push(extra);
  }
  return lines.join('\n');
}
