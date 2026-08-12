# Shared home skills truth (post-4.5.7 seed)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [Agent guide](../../agent-guide.md) · [Upgrade skill](../../../templates/skills/ark-upgrade.md)

**Status:** Seeded for **arkgate@4.5.8** (Phase HS; not published)  
**Slug:** `shared-home-skills-truth`  
**Kind:** epic seed / field-truth + multi-project agent home catalogs  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-12  
**Target package:** **4.5.8** (patch train when HS01–HS06 land; no “published” claim until HS06)  
**Evidence origin:** dogfood after 4.5.7 — Cursor/Claude loaded stale `~/.claude/skills` at
`arkVersion: 2.6.1` while project catalogs were **4.5.7**; Codex home already had a monotonic
catalog (4.2+); Grok home had the same unmanaged orphan pattern

---

## Why this seed exists

**4.5.7 shipped** Cursor hard write. Multi-project skill truth is still asymmetric:

1. **Repo catalogs are correct.** `.claude/skills`, `.agents/skills`, `.grok/skills`, Cursor
   commands track the project’s installed `arkgate`. Pins in progress may lag npm `latest` —
   that is intentional per checkout.

2. **Codex home is already a shared monotonic catalog.** `$CODEX_HOME/skills` +
   `.arkgate-catalog.json` advances only forward (4.2.0+); older writers cannot downgrade even
   with `--force`. Stamp-only lag is a no-op when the skill body matches the template.

3. **Claude / Grok / Cursor user-home skills are not managed.** Hosts often load
   `~/.claude/skills/ark-*/SKILL.md` (and sometimes `~/.grok/skills/...`) **ahead of or beside**
   the project catalog. Orphan installs from old global/`npx` sessions stay at **2.x** and coach
   wrong upgrade pins (`arkgate@4.5.0`, `npm install -D arkgate@latest` prose, etc.). Doctor
   today does not treat that as urgent catalog debt.

4. **Product preference for shared home:** always **latest additive** on the machine. A repo
   pinned to an older patch keeps its **project** skills; it must **never** pull the shared home
   catalog backward.

This train closes the Claude/Grok home gap with the **same ratchet** Codex already has — not a
second skill namespace, not scores, not silent overwrite of true user edits.

Related shipped work:

- [workspace-identity-activation-truth](../workspace-identity-activation-truth/README.md) (4.2.0)
  — Codex home monotonic catalog + repo isolation
- [field-upgrade-mcp-truth](../field-upgrade-mcp-truth/README.md) (4.5.6) — upgrade / skill drift /
  multi-project MCP honesty

---

## Product model (one machine, many projects)

| Fact | Product implication |
|------|---------------------|
| N checkouts, N pins | **Repo** skill catalogs stay per-project and may lag |
| Hosts load user-global skills | **Shared home** catalogs must be machine floor = newest Ark writer |
| Skills are mostly additive | Prefer advancing home to latest; never invent downgrades |
| Customized managed skills | Content-identity preserve stays default; consent refresh remains FX04 path |
| Codex already correct | Reuse `scope=home` / catalog lock / floor — do not fork a second protocol |
| No ark-* in home | Absence is normal; do not create home catalogs unless opted in or orphans exist |

**Non-goals:** auto-downgrade project pins to match home; new skill names; treating AGENTS.md /
skills as enforcement; rewriting customized bodies without consent.

---

## Freeze (held unless ROADMAP item says otherwise)

| Frozen | Why |
|--------|-----|
| Numeric scores / ranks | Compass + coach stay `notAScore` |
| New skill **names** beyond 13 | Deepen `/ark-upgrade` (+ install/doctor copy) only |
| New ArkRules sensors | Out of scope |
| LLM package pass/fail | Deterministic only |
| Soft hosts claiming hard write | Honesty labels only (CH already scoped Cursor) |
| Silent overwrite of customized managed skills | Preserve + `--refresh-skills` / `--accept-conflicts` |
| Silent multi-project MCP retarget | Fail-closed + restart/CLI (FX06) |
| Downgrade of any shared home catalog | Monotonic floor forever (Codex rule → Claude/Grok) |

---

## Ordered backlog

Promote only when IDs appear as `todo`/`doing` in ROADMAP. Suggested phase prefix: **`HS`**
(Home Skills / shared agent homes). Preferred order:

**HS01 → HS02 → HS03 → HS04 → HS05 → HS06**

| ID | Size | Priority | Track | Outcome |
|----|-----:|----------|-------|---------|
| `HS01` | M | P0 | Detect / doctor | **Home catalog honesty:** detect present `~/.claude/skills` and `~/.grok/skills` `ark-*` trees; report missing/stale/customized vs package; urgent when content-behind or stamp floor older than package; ignore absent homes |
| `HS02` | L | P0 | Install ratchet | **Monotonic Claude + Grok home install:** reuse Codex `scope=home` catalog/lock/floor; flags `--claude-home` / `--grok-home` and/or `--agent-homes`; never downgrade; stamp-only no-op; env overrides for tests (`CLAUDE_HOME` / `GROK_HOME` or documented equivalents) |
| `HS03` | M | P0 | Upgrade path | **Upgrade / install wiring:** when homes already contain Ark skills (or flags set), advance them on upgrade/`--install-agent-gates`; structured notes + recovery commands; never mutate real homes from temp/upgrade scratch roots |
| `HS04` | S | P1 | Docs / skill | **Multi-project home recipe:** agent-guide + `/ark-upgrade` + doctor actions — repo vs shared home; always-latest home; Codex parity; safe delete leftovers only when documented as non-loadable |
| `HS05` | M | P0 | Release prep | **Prepare arkgate@4.5.8:** version surfaces, CHANGELOG, `docs/releases/4.5.8.md` (prepared), docs hub honesty, tests green, `release:npm --dry` |
| `HS06` | L | P0 | Release train | **Publish everywhere + web:** land PR(s), signed tag `v4.5.8`, GH Release, OIDC npm `latest`, MCP registry, docs Status published, arkgate-site 4.5.8 story |

---

## Item detail

### HS01 — Home catalog honesty (doctor / detect)

**Field bug:** Cursor loads stale `~/.claude/skills` while project skills are current; humans
think Ark “updated agents” but the host still coaches 2.x.

**Acceptance:**

- Doctor (and JSON) surfaces Claude/Grok home gaps when `ark-*` skills exist under those homes.
- Absent home trees → no spam.
- Stale = content behind package template and/or catalog floor older than package (align with
  Codex home gap semantics; stamp-only body-match is not “content-behind”).
- Next actions name the exact `ark-check --install-agent-gates …` flags from HS02.

### HS02 — Monotonic Claude + Grok home install

**Acceptance:**

- Writing `~/.claude/skills/<name>/SKILL.md` and `~/.grok/skills/<name>/SKILL.md` uses the same
  home catalog protocol as Codex (`.arkgate-catalog.json`, lock, pending recovery, monotonic
  floor).
- Older package vs newer home floor → skip entire catalog (even `--force`).
- Newer package → may advance bodies when force/consent rules match existing home skill policy.
- Tests cover: advance, block downgrade, stamp-only skip, lock contention, interrupted pending,
  isolated env homes (no write to developer real home in CI).

### HS03 — Upgrade / install wiring

**Acceptance:**

- `--agent-homes` (or documented flag set) refreshes Claude + Grok (+ optionally Codex) in one
  invocation.
- Upgrade preview/apply notes when detected home catalogs are behind package.
- Temp/`ark-upgrade` scratch `--root` never mutates default user homes (mirror Codex temp-root
  guard).

### HS04 — Docs and skill deepen

**Acceptance:**

- Agent guide + `/ark-upgrade` state: project catalog = pin truth; shared home = machine floor
  (latest additive); how to refresh; how doctor reports orphans.
- No new skill names; agent-skills 1:1 with templates.

### HS05 / HS06 — Prepare and publish 4.5.8

Standard release train. No “published” wording until HS06 evidence (npm `latest`, tag, site).

---

## Done when

1. Orphan Claude/Grok home skills cannot silently coach a stale major/minor on a machine that
   has run a 4.5.8+ installer with home flags / upgrade home advance.
2. Shared homes never downgrade across multi-project writers on 4.5.8+.
3. Doctor makes the gap visible before agents invent wrong pins.
4. **4.5.8** published with release notes that tell the shared-home story (not only a version
   bump).

---

## Out of scope / later seeds

| Seed | Relationship |
|------|----------------|
| Golden upgrade path matrix | Hosts × package managers proof after HS lands |
| Copilot flat prompts / other non-Ark home trees | Only if field proves loadable Ark orphans |
| Z09 / RB-11 | Unrelated claim-gate residual |
