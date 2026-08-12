# Understandable Ark (4.6.0)

> **Plan, not implementation authority.** Code and executable schemas decide whether a claim is
> true. Work starts only when item IDs appear as `doing`/`todo` in [ROADMAP.md](../../../ROADMAP.md).
> Hub: [AGENTS.md](../../../AGENTS.md) · [Roadmap](../../../ROADMAP.md) ·
> [Product voice](../../product-voice.md)

**Status:** In progress for **arkgate@4.6.0** (Phase PL; `PL01`–`PL08` implemented; not published until PL09)  
**Slug:** `understandable-ark-4.6`  
**Kind:** epic seed / product-language + shared home skills (one train)  
**Owners:** product (Pedro) + library maintainers  
**Last updated:** 2026-08-12  
**Target package:** **4.6.0** (minor — visible product language + home-skill honesty; no
“published” claim until PL09)  
**Absorbs:** former 4.5.8 seed [shared-home-skills-truth](../shared-home-skills-truth/README.md)
(superseded as a separate patch train; work lives here as PL06–PL07)  
**Evidence origin:** friend walkthrough — proprietary jargon opaque on first contact; dogfood
orphan `~/.claude/skills` at 2.x while project catalogs were current

---

## Why one 4.6 train

Low adoption is the window to fix **how Ark talks** without a painful migration story, and to
close the **shared home skills** gap in the same release so the product feels newly approachable
*and* truthful on a multi-project machine.

1. **Language:** doctor, HTML, skills, and public docs use common software words (imports, config,
   blocked edit, leftover work) — not an Ark-only dialect.
2. **Home skills:** Claude/Grok user-home catalogs get the same monotonic “always latest
   additive” floor Codex already has; orphan 2.x global skills stop coaching wrong pins.
3. **Stability:** keep machine IDs (`ruleId`, MCP tools, JSON schema fields) stable unless an
   explicit compat alias is required; humans see new words first.

---

## Product principles

| Principle | Meaning |
|-----------|---------|
| **Common words first** | Prefer terms a senior engineer already knows; invented compound jargon goes |
| **Keep product brands** | **ArkGate** (product / npm `arkgate`) and **ArkRules** (opt-in structure-rules plane) stay as proper names. On first mention in a surface, optionally gloss in plain words (“ArkRules — structure rules inside a layer”); do not rename the brands |
| **Same truth, clearer words** | Hard vs advisory, fail-closed, residual ≠ score — distinctions stay; dialect around the brands goes |
| **Two planes** | Human surfaces reform freely; machine contract changes only with aliases / docs |
| **Repo vs home** | Project skills follow the pin; shared home = machine floor (never downgrade) |
| **One next action** | Every human status line still ends with one concrete command or skill |

**Success check:** someone who never used Ark can read doctor + one HTML report in ~2 minutes
and say what is blocked, what is only a warning, and what to do next — without a glossary.

---

## Freeze (held unless ROADMAP item says otherwise)

| Frozen | Why |
|--------|-----|
| **ArkGate** / **ArkRules** as primary names | Product brands — gloss, don’t rebrand |
| Numeric scores / ranks | Compass stays `notAScore` |
| New skill **names** beyond 13 | Deepen bodies + voice only |
| New ArkRules sensor vocabulary | Out of scope |
| LLM package pass/fail | Deterministic only |
| Soft-host hard-write claims | Honesty unchanged (CH Cursor scope held) |
| Silent customized overwrite | Preserve + consent refresh |
| Silent MCP retarget | Fail-closed + restart/CLI |
| Home catalog downgrade | Monotonic floor |
| Mass rename of `ruleId` / MCP tool names | Compat first; human copy first |

---

## Ordered backlog

Phase prefix: **`PL`** (Plain Language / Product Literacy). Preferred order:

**PL01 → PL02 → PL03 → PL04 → PL05 → PL06 → PL07 → PL08 → PL09**

| ID | Size | Priority | Track | Outcome |
|----|-----:|----------|-------|---------|
| `PL01` | M | P0 | Lexicon | **Term map + product-voice 4.6:** canonical old→common table; rewrite `docs/product-voice.md`; ban new jargon without map entry |
| `PL02` | L | P0 | Human CLI | **Doctor / CLI / status** human strings use common terms; JSON field names unchanged unless aliased |
| `PL03` | M | P0 | HTML | **Report UI copy** (headings, pills, residual cards) matches voice; no score language |
| `PL04` | L | P0 | Agents | **Skills + compact router + projection** in plain language; agent-skills 1:1; same 13 names |
| `PL05` | M | P0 | Docs | **Public lanes + README** (use / develop / agent-guide / ai-gates as needed); site messaging deferred to PL09 checklist but copy drafted here |
| `PL06` | M | P0 | Home detect | **Claude + Grok home honesty** (former HS01): doctor/JSON when `ark-*` homes exist and lag |
| `PL07` | L | P0 | Home install | **Monotonic home install + upgrade wiring** (former HS02–HS03): `--claude-home` / `--grok-home` / `--agent-homes`; temp-root safety; upgrade notes |
| `PL08` | M | P0 | Release prep | **Prepare arkgate@4.6.0:** version surfaces, CHANGELOG, `docs/releases/4.6.0.md` prepared |
| `PL09` | L | P0 | Release train | **Publish everywhere + web:** tag, npm, MCP registry, docs published, arkgate-site 4.6.0 story (plain language + shared homes) |

---

## Draft term map (starting point — lock in PL01)

### Brands (keep)

| Brand | Optional first-mention gloss | Do not |
|-------|------------------------------|--------|
| **ArkGate** | “architecture write firewall + coach” / the npm package | rename product or package for voice reasons |
| **ArkRules** | “structure rules inside a layer” (opt-in) | replace with a generic synonym as the primary name |

### Dialect → common words

| Prefer (common) | Was (Ark dialect) | Keep the distinction |
|-----------------|-------------------|----------------------|
| architecture config | contract | still `ark.config.json` |
| import rules / allowed dependencies | Layers plane / edges | still the import graph |
| ArkRules (+ gloss above) | bare “ArkRules” with no gloss on first hit | still opt-in `arkrules/*` |
| blocked edit / pre-write block | hard write | only when host actually blocks |
| warning only (not blocked) | advisory write | soft hosts |
| rules on / protected | Enforce | status light meaning unchanged |
| leftover work / still messy design | residual / design-weak | not a score; not “done” |
| one small refactor | pilot | one at a time |
| check (tool) | scan | deterministic, no LLM |
| your judgment / coaching | process | never package pass/fail |
| don’t show green if unverified | fail-closed | honesty |
| right project? | matched binding / project identity | MCP handshake |
| what to improve next | improvement compass / lenses | still `notAScore` |
| shared agent skills (home) | Codex/Claude/Grok home catalog | monotonic floor |

PL01 may refine this table; shipped human copy must not invent terms outside it without updating
the voice doc in the same change. **ArkGate** / **ArkRules** are not “jargon to erase.”

---

## Machine / human split

| Surface | 4.6 expectation |
|---------|-----------------|
| Doctor human lines, HTML, skills, README, use/develop | New lexicon |
| `ark status --json`, diagnostics `ruleId`, MCP tool names | Stable by default |
| Optional human aliases in JSON (`summaryPlain`, etc.) | Only if agents need them; not required for PL02 |
| Home skill `arkVersion` stamps + `.arkgate-catalog.json` | Same Codex protocol extended to Claude/Grok |

---

## Done when

1. Friend-test: first-time reader understands doctor + one report without a glossary.
2. Orphan Claude/Grok home skills cannot silently coach stale majors after a 4.6+ home refresh.
3. Shared homes never downgrade across multi-project writers.
4. **4.6.0** published with release notes that lead with *clearer language* and *honest shared
   skills* — not only a version bump.
5. No new skill names; no scores; machine IDs not mass-renamed.

---

## Out of scope / later

| Item | Why later |
|------|-----------|
| Spanish product voice as default | Separate decision; this train is English common terms |
| Renaming npm package / CLI bins | Identity freeze |
| Z09 / RB-11 | Unrelated claim gate |
| Golden upgrade matrix proof | After PL07 |
