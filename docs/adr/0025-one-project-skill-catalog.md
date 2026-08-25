# ADR 0025 — One project skill catalog

- **Status:** Accepted
- **Date:** 2026-08-25
- **Phase:** HS (arkgate@4.7.1)

## Decision

Project `/ark-*` skills have **one byte source**: `.agents/skills/<name>/SKILL.md`.

- Codex, Cursor, and Antigravity read that path natively. Do not also write
  `$CODEX_HOME/skills`, `.cursor/commands`, or `.codex/skills` for the same names.
- Claude, Grok, and OpenCode get **relative adapter links** to that catalog.
- Hosts that scan more than one of those paths may still *list* the skill twice;
  the body and the visible `arkgate@<version>. ` description prefix are the same.
- Shared home catalogs (`--codex-home`, `--agent-homes`) are skipped when the
  project catalog already exists. `--prune-home-duplicates` removes leftover
  home `ark-*` copies. Non-Ark home skills are never deleted.

Install stamps `description` with `arkgate@<package>. ` so the picker shows
staleness without opening the file. `arkVersion:` remains the doctor stamp.
Same-body stamp drift is `stamp-refresh` (no `--force`).

MCP stays **project-bound** (`.codex/config.toml` / `.grok/config.toml` with
`--root .`). Home MCP is not written when a project Codex config already exists.

## Why

Codex (and Cursor) **do not merge same-name skills**. User + repo copies both
appear. Home catalogs also lag the project pin, so the picker showed two
versions and the old body won on some hosts (Claude personal > project).

## Consequences

- Multi-host in one repo: one install writes one catalog + adapters.
- Multi-project on one machine: each repo owns its catalog; home `ark-*` is
  leftover debt, not the source of truth.
- No new skill names. ArkRun remains `/ark-adopt` (extra) + `/ark-runtime`
  (companion) + `/ark-place` (new files).
