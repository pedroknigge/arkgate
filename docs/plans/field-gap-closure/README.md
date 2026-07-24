# Field gap closure — full improvement plan (post 4.1.0 lab)

**Status:** plan (not authorized until IDs appear as `doing`/`todo` in `ROADMAP.md`)  
**Generated:** 2026-07-24  
**Evidence base:** temp field lab `/tmp/ark-field-lab-95358` against mother **arkgate 4.1.0** (`feat/4.1.0-field-p0-p1-p2` @ `fd7e7b0`) — **not** npm `latest` 4.0.1.  
**Sources:** `FIELD-GAPS.json` (20), `falseGreenRisks` (8), `USE-CASE-BATTERY`, `DEEP-*-rules-planb`, `FEATURE-4.1.0-VALIDATION`.

## Goal

Close **every** observed field gap — critical through cosmetic — so a hostile brownfield cohort (Next monorepos, Vite SPA, dcouplr kernels) can:

1. Install/start without inventing a false architecture world  
2. Never read “finished / honest green” when the graph is red or ungoverned  
3. Get truthful multi-domain ArkRules + Plan B without dual-plane contradictions  
4. Re-run the same 7-repo lab as a **regression suite** before each minor

## Non-goals

- Closing Z09 / RB-11 field *claim* cohort (separate claim gate)  
- Replacing judgment Plan B with mechanical auto-apply  
- Turning ArkRules into a numeric score  

## North-star product invariant (unchanged)

Agents write most code. A green check must mean something real. Prefer fail-closed honesty over comfort.

---

## Inventory: all gaps (must map to a work item)

### Critical (2)

| ID | Title | Fix owner surface |
|----|-------|-------------------|
| `NEW-SPA-DEFAULT-LAYOUT` | Vite SPA + root `api/`/`lib/` missed by default include | presets / start / adopt |
| `NEW-MONOREPO-CWD-WALKUP` | Package cwd invents ADAPT 0% | config discovery / CLI root |

### High (6)

| ID | Title | Fix owner surface |
|----|-------|-------------------|
| `P0B-DUAL-TRUTH-PIN` | Pin behind CLI honesty | upgrade / doctor / CI template |
| `P0B-PIN-ABSENT-WRITEPATH` | Configured gates vs installed:false | writePath honesty / start |
| `NEW-APP-VACUUM-LIB` | `src/lib/**` Application vacuum | start / adopt / presets |
| `NEW-ADOPT-LIB-AS-PRESENTATION` | root `lib/*` → Presentation lie | adopt heuristics |
| `NEW-ARKRULES-UNCLASSIFIED-ATTRIBUTION` | Sensors on unclassified files | dual-plane / scan |
| `NEW-FORCE-GATES-VS-UPGRADE-DIGEST` | force clobber + digest break | managed-upgrade / install-gates |

### Medium (7)

| ID | Title | Fix owner surface |
|----|-------|-------------------|
| `NEW-AGENTS-11-LAYER-TABLE` | Stock 11-layer table on custom contracts | AGENTS generation |
| `P0B-FINISHED-WITH-OPEN-DEBT` | productHonesty finished with red graph | productHonesty |
| `NEW-START-LOW-CONFIDENCE-SHAPE` | start --yes at low confidence | start |
| `P0A-DUAL-MATCH-APP-API-OPACITY` | dual-match without signal | coverage / doctor |
| `P1L-STRUCTURE-NOISE-CONTROL-FLOW` | `.if` / control-flow FP | arkRuleSensors |
| `P1M-EXTRATEETH-EMPTY-GRAPH` | structure teeth at 0% governed | mergePlanes |
| `FG-EMPTY-PLAN-A-DESIGN-WEAK` | empty plan A vs Shape residual | post-green / product voice |

### Low / info (5)

| ID | Title | Fix owner surface |
|----|-------|-------------------|
| `P0B-HEADLINE-WHOLETREE-WORDING` | dual-truth headline vs wholeTree | productHonesty copy |
| `P2N-INVENTORY-NOISE-RESIDUAL` | inventory residual noise | rulesInventory |
| `NEW-TYPEONLY-VOLUME` | high type-only volume (behavior OK) | SharedTypes starter / plan |
| `NEW-DOCTOR-STALE-FINISH-START` | doctor still says finish start | doctor nextAction |
| `NEW-NO-CHECK-SCRIPT-ON-START` | missing `check:architecture` | start / install-gates |
| `P0C-ESLINT-UNVERIFIED` | ESLint aliases not field-proven | eval lab |

### Additional deep-lab gaps (not in JSON, still in scope)

| ID | Title | Severity |
|----|-------|----------|
| `DL-DOMAIN-SPECIFICITY` | Application `src/**` outranks Domain globs → empty Domain | critical |
| `DL-P0A-RETROFIT` | Brownfield contracts not migrated to API→Application | high |
| `DL-TYPEEDGE-POLICY-FIELD` | `typeEdgePolicy` often missing on doctor JSON | low |
| `DL-START-APPLY-MESSAGE` | “preview no files” + “Applied N mutations” | low |
| `DL-DESIGN-SMELLS-VS-WEAK` | smells present but designWeak false with open edges | medium |
| `DL-PLANB-SKILL-DEPTH` | Plan B extract cards exist; agents need stronger skill loop | medium |
| `DL-PARITY-TEST` | ESLint parity test expected ok:false for type-only (4.1.0) | high (CI) |

### False-green risks (acceptance targets)

| ID | Summary | Closes with |
|----|---------|-------------|
| `FG-WEAK-COVERAGE-NONSTRICT` | Green at 0% governed | SPA layout + monorepo walkup + strict defaults messaging |
| `FG-EMPTY-DOMAIN-IO-UNDER-APP` | 100% governed, empty Domain | vacuum + domain specificity |
| `FG-CI-PIN-SKEW` | Mother ≠ CI pin | dual-truth + upgrade install |
| `FG-WRITEPATH-CONFIGURED-NOT-INSTALLED` | Hard write assumed | pin-absent honesty |
| `FG-ARKRULES-ADVISORY-ONLY` | Max packs no teeth | docs only (by design) unless user promotes |
| `FG-FINISHED-ADAPT-DEBT` | finished + 1057 viol | productHonesty finished definition |
| `FG-EXTRATEETH-EMPTY-CLASSIFICATION` | structure teeth @ 0% | P1M-EXTRATEETH-EMPTY-GRAPH |
| `FG-EMPTY-PLAN-A-DESIGN-WEAK` | green plan A / residual Shape | post-green path |

**Coverage rule:** every row above must land as `done` or `wontfix` with written rationale before this plan is “closed.”

---

## Execution train (solve everything)

Work is ordered so **honesty and false-green die first**, then **classification**, then **upgrade/DX polish**, then **ArkRules/Plan B quality**, then **lab automation**.

### Train overview

| Slice | Ship as | Theme | Closes (IDs) |
|-------|---------|-------|----------------|
| **S0** | unblocks 4.1.0 PR | CI + release hygiene | `DL-PARITY-TEST` |
| **S1** | **4.1.0** remaining or **4.1.1** | productHonesty anti false-green | `P0B-FINISHED-WITH-OPEN-DEBT`, `P0B-HEADLINE-WHOLETREE-WORDING`, `FG-FINISHED-ADAPT-DEBT`, `DL-DESIGN-SMELLS-VS-WEAK` |
| **S2** | **4.1.1** | monorepo + pin honesty | `NEW-MONOREPO-CWD-WALKUP`, `P0B-DUAL-TRUTH-PIN`, `P0B-PIN-ABSENT-WRITEPATH`, `FG-CI-PIN-SKEW`, `FG-WRITEPATH-*` |
| **S3** | **4.1.1 / 4.2.0** | classification / adopt / start | `NEW-SPA-DEFAULT-LAYOUT`, `NEW-APP-VACUUM-LIB`, `NEW-ADOPT-LIB-AS-PRESENTATION`, `DL-DOMAIN-SPECIFICITY`, `DL-P0A-RETROFIT`, `P0A-DUAL-MATCH-*`, `NEW-START-LOW-CONFIDENCE-SHAPE`, `FG-EMPTY-DOMAIN-*`, `FG-WEAK-COVERAGE-*` |
| **S4** | **4.1.1** | gates / upgrade | `NEW-FORCE-GATES-VS-UPGRADE-DIGEST`, `NEW-AGENTS-11-LAYER-TABLE`, `NEW-NO-CHECK-SCRIPT-ON-START`, `NEW-DOCTOR-STALE-FINISH-START`, `DL-START-APPLY-MESSAGE` |
| **S5** | **4.2.0** | dual-plane / sensors / inventory | `NEW-ARKRULES-UNCLASSIFIED-ATTRIBUTION`, `P1M-EXTRATEETH-EMPTY-GRAPH`, `P1L-STRUCTURE-NOISE-*`, `P2N-INVENTORY-*`, `NEW-TYPEONLY-VOLUME`, `DL-TYPEEDGE-POLICY-FIELD`, `FG-EXTRATEETH-*`, `FG-ARKRULES-ADVISORY-ONLY` (docs) |
| **S6** | **4.1.1+** | ESLint field proof + Plan B DX | `P0C-ESLINT-UNVERIFIED`, `DL-PLANB-SKILL-DEPTH`, `FG-EMPTY-PLAN-A-DESIGN-WEAK` |
| **S7** | continuous | field regression lab | all IDs re-proven |

---

## Slice S0 — Unblock 4.1.0 PR (hours)

| Task | Gap | Acceptance |
|------|-----|------------|
| S0.1 Commit ESLint parity test: type-only `ok:true` + `failsStrict:false` + still flags | `DL-PARITY-TEST` | Adapter parity CI green — **done** (`be24601` / `tests/unit/eslint/parity.test.ts`) |
| S0.2 Optional: dry-run release artifacts for prepared 4.1.0 | — | Not required for code closure; run `npm run release:npm -- --dry` on clean SHA before publish |

---

## Slice S1 — productHonesty tells the truth (days)

**Owner modules:** `bin/lib/enforcement-honesty.mjs`, `doctor-plan.mjs`, `html-report-depth.mjs`, tests `fieldP0P1P2` / enforcementHonesty.

| Task | Gap | Implementation sketch | Acceptance |
|------|-----|----------------------|------------|
| S1.1 Redefine `finished` / `unfinished` | `P0B-FINISHED-WITH-OPEN-DEBT`, `FG-FINISHED-ADAPT-DEBT` | `unfinished` if any of: active **blocking** violations > 0; operatingMode ∈ {adapt,suggest}; baseline missing-with-debt; designWeak; dual-truth; weak/partial coverage; residual pilot. Rename internal docs: finished = “no residual honesty sensors” **only if** graph+mode also green — or rename field to `residualHonestyClear` + keep `architectureClear` | amarilla-like tree: finished false while 1000+ viol; reasonId `active-blocking-violations` or `mode-adapt-with-debt` |
| S1.2 Headline variants | `P0B-HEADLINE-WHOLETREE-WORDING` | Separate strings for dual-truth vs coverage | dual-truth only → no “not whole-tree” if wholeTreeGuarantee true |
| S1.3 Design smells with open edges | `DL-DESIGN-SMELLS-VS-WEAK` | If smells fire and active violations > 0, productHonesty unfinished; optional designWeak alignment | doctor not “elegant true” with 5 smells + red check |
| S1.4 HTML parity | — | same reasonIds as doctor | reportParity + field test |
| S1.5 Docs product-voice | — | “Honesty clear ≠ architecture healthy” | voice table row |

**Exit:** FG-FINISHED-ADAPT-DEBT closed; UC battery amarilla productHonesty recheck.

---

## Slice S2 — Monorepo root + pin/writePath honesty (days)

| Task | Gap | Implementation sketch | Acceptance |
|------|-----|----------------------|------------|
| S2.1 Config walk-up | `NEW-MONOREPO-CWD-WALKUP` | From cwd, walk parents for `ark.config.json` (stop at fs root / workspaces boundary); set effective root; doctor note `configRoot` | `cd apps/web && ark-check --doctor` finds monorepo config, mode enforce, governed ≫ 0 |
| S2.2 Hard fail option | same | If package.json has workspaces and no config in package and walk-up finds root, never invent 11-layer default silently | default 11-layer only for true greenfield |
| S2.3 Dual-truth CI action | `P0B-DUAL-TRUTH-PIN`, `FG-CI-PIN-SKEW` | upgrade apply suggests pin bump; doctor primaryNextAction = install path; optional `--strict-merge` flag `failOnDualTruth` (default off) | predial-style pin behind: unfinished + nextCommand install |
| S2.4 WritePath ladder/state | `P0B-PIN-ABSENT-WRITEPATH`, `FG-WRITEPATH-*` | Single function for installed; configured≠installed always surfaces reason `PACKAGE_PIN_ABSENT`; never hard:true without pin+node_modules | ladder/state agree on superinsights clone --no-install |
| S2.5 Mother dogfood flag | — | `ARK_MOTHER_CLI=1` or path-based detection softens pin-absent for library authors | mother tree doctor not yelling pin-absent as user-facing unfinished? (or keep honest) |

---

## Slice S3 — Classification, adopt, start (largest engineering)

### S3.1 Start / presets — no more Application vacuum

| Task | Gap | Acceptance |
|------|-----|------------|
| S3.1.1 Never use lone `src/**` as Application catch-all on Next/event archetypes | `NEW-APP-VACUUM-LIB`, `DL-DOMAIN-SPECIFICITY` | amarilla-like: Domain patterns for `**/domain/**`, `**/kernel/domain/**` beat Application scatter; Domain file count > 0 when domain tree exists |
| S3.1.2 Persistence heuristics for `**/repositories/**`, `**/db/**`, `**/supabase/**`, `**/airtable/**` | same | Persistence file count rises; App→Persist edges become real (honest red) |
| S3.1.3 Composition-root optional layer or Application-only for factories | meiridan factories | documented pattern in brownfield guide |
| S3.1.4 SPA profile `vite-vercel-spa` | `NEW-SPA-DEFAULT-LAYOUT` | include `src,api,lib`; api→Application; db/crm lib→Persistence; React→Presentation; superinsights start ≥80% governed without manual adopt |
| S3.1.5 Confidence gate on `--yes` | `NEW-START-LOW-CONFIDENCE-SHAPE` | if archetype confidence < 0.6 **or** projected coverage < 50%: refuse silent --yes; print choices |
| S3.1.6 Start apply messaging | `DL-START-APPLY-MESSAGE` | single honest summary (applied vs noop) |

### S3.2 Adopt heuristics

| Task | Gap | Acceptance |
|------|-----|------------|
| S3.2.1 Filename/path scores: turso/prisma/supabase/auth client → Persistence | `NEW-ADOPT-LIB-AS-PRESENTATION` | superinsights lib/turso not Presentation |
| S3.2.2 Never map bare `lib/**` solely to Presentation | same | adopt dry-run fixtures |
| S3.2.3 Domain discovery for kernel/ddd folders | `DL-DOMAIN-SPECIFICITY` | field fixture |

### S3.3 P0-A retrofit

| Task | Gap | Acceptance |
|------|-----|------------|
| S3.3.1 `ark upgrade` / `ark-check --migrate-contract` additive: inject high-spec `app/api/**` → Application if missing | `DL-P0A-RETROFIT`, UC3 fail predial/superlock | after migrate, API routes layer Application; UI pages Presentation |
| S3.3.2 dualMembership in coverage | `P0A-DUAL-MATCH-APP-API-OPACITY` | JSON lists overlapping layers; doctor one line |
| S3.3.3 Field UC3 regression: predial fixture with old globs → migrate → pass | — | automated |

### S3.4 False-green exit

Closes `FG-WEAK-COVERAGE-NONSTRICT`, `FG-EMPTY-DOMAIN-IO-UNDER-APP`.

---

## Slice S4 — Gates, upgrade, agent surfaces (days)

| Task | Gap | Acceptance |
|------|-----|------------|
| S4.1 install-agent-gates --force | `NEW-FORCE-GATES-VS-UPGRADE-DIGEST` | preserve customized content-identity assets; recompute managed digest after force; or block force with “run upgrade preview again” |
| S4.2 Default refresh = skills-only when managed upgrade present | same | predial-like session |
| S4.3 AGENTS.md placement table from live layers | `NEW-AGENTS-11-LAYER-TABLE` | 8-layer monorepo gets 8-row table |
| S4.4 Write `check:architecture` on start apply | `NEW-NO-CHECK-SCRIPT-ON-START` | package.json has script |
| S4.5 Doctor newHere / primaryNextAction | `NEW-DOCTOR-STALE-FINISH-START` | after start, next = adopt/coverage/fix not “finish start” |

---

## Slice S5 — Dual-plane, sensors, inventory (days–week)

| Task | Gap | Acceptance |
|------|-----|------------|
| S5.1 Structure sensors only on classified files | `NEW-ARKRULES-UNCLASSIFIED-ATTRIBUTION` | no ARKRULE_STRUCTURE with unclassified path |
| S5.2 extraMergeTeeth requires governedPercent ≥ N (e.g. 50) and ≥1 classified layer populated | `P1M-EXTRATEETH-EMPTY-GRAPH`, `FG-EXTRATEETH-*` | superinsights empty classification cannot arm teeth |
| S5.3 Structure FN: ignore `.if` / match / when methods | `P1L-STRUCTURE-NOISE-CONTROL-FLOW` | propia Property.if silent; true mutators still fire |
| S5.4 Inventory filters wave-2 | `P2N-INVENTORY-NOISE-RESIDUAL` | predial candidates down without losing spaghetti seeds |
| S5.5 SharedTypes starter pack + plan messaging for type-only volume | `NEW-TYPEONLY-VOLUME` | optional layer template; plan groups type-only |
| S5.6 Always emit doctor `typeEdgePolicy` when any typeOnly finding or policy active | `DL-TYPEEDGE-POLICY-FIELD` | field doctor JSON |
| S5.7 Docs: advisory ArkRules ≠ merge teeth | `FG-ARKRULES-ADVISORY-ONLY` | product-voice + explain |

---

## Slice S6 — ESLint field proof + Plan B DX

| Task | Gap | Acceptance |
|------|-----|------------|
| S6.1 Lab job with `pnpm install` on 1–2 Next clones | `P0C-ESLINT-UNVERIFIED` | Offline unit dual-driver (`@/*` resolve + ESLint fire + CLI match) in `fieldP0P1P2_4_1_0` — full Next clone still optional field |
| S6.2 ark-explore / ark-fix skill: Plan B card → one pilot checklist with killSwitch | `DL-PLANB-SKILL-DEPTH` | skill text + `skillsSurface` lock — **done** |
| S6.3 Empty plan A + design-weak: doctor never “goal met finished” | `FG-EMPTY-PLAN-A-DESIGN-WEAK` | design-weak-enforce: productHonesty unfinished + postGreenPath — **done** |

---

## Slice S7 — Field regression lab (ongoing)

Promote the temp lab into a **maintainer script** (not product surface):

```text
scripts/field-dogfood/
  README.md             # how to run against mother 4.1.0
  gap-assertions.json   # gap locks + soft-skips
  smoke.mjs             # offline unit re-run (npm run test:field-dogfood-smoke)
```

| Task | Acceptance |
|------|------------|
| S7.1 Manifest + runner under `eval/` or `scripts/` | **done** — `scripts/field-dogfood/` + CONTRIBUTING row |
| S7.2 CI optional workflow `field-dogfood.yml` (nightly / manual) | deferred; smoke is local/CI-cheap via npm script; full clones stay workflow-only |
| S7.3 Golden fixtures for: monorepo cwd, spa layout, empty domain vacuum, productHonesty red graph | unit suites wired in gap-assertions (monorepo walk-up soft-skip until S2) |

---

## Dependency graph

```text
S0 ──► publish-ready 4.1.0 branch
S1 ──► required before claiming anti false-green
S2 ──► required for monorepo consumers (propia)
S3 ──► largest; depends on S1 for messaging; unblocks adopt field
S4 ──► parallelizable with S2
S5 ──► after S3 (classification must be true first)
S6 ──► after S0; parallel with S5
S7 ──► continuous after S1–S3 land
```

---

## Suggested ROADMAP seeding (copy into ROADMAP when authorized)

| ID | Slice | Size | Summary |
|----|-------|------|---------|
| `FG01` | S1 | M | productHonesty finished requires green mode+blocking |
| `FG02` | S2 | M | monorepo config walk-up |
| `FG03` | S2 | S | writePath pin-absent consistency |
| `FG04` | S3 | L | start/adopt: kill Application vacuum + Domain specificity |
| `FG05` | S3 | M | vite-vercel-spa profile |
| `FG06` | S3 | M | P0-A contract migrate retrofit API→Application |
| `FG07` | S3 | S | start confidence / coverage gate |
| `FG08` | S4 | M | force-gates + upgrade digest integrity |
| `FG09` | S4 | S | AGENTS table from live layers |
| `FG10` | S4 | S | check:architecture + doctor nextAction |
| `FG11` | S5 | M | dual-plane: sensors only classified; teeth need coverage |
| `FG12` | S5 | S | structure FN control-flow names |
| `FG13` | S5 | S | inventory noise wave-2 |
| `FG14` | S6 | S | ESLint field proof lab |
| `FG15` | S6 | S | Plan B skill depth |
| `FG16` | S7 | M | automated field dogfood suite |

---

## Per-slice test plan (minimum)

| Slice | Automated tests | Field re-check |
|-------|-----------------|----------------|
| S1 | unit productHonesty matrix (adapt+violations unfinished; dual-truth headline; enforce green finished) | amarilla doctor finished false |
| S2 | unit walk-up; propia-like fixture | propia apps/web |
| S3 | unit layerMatch specificity; start projected coverage; spa fixture | amarilla Domain>0; superinsights governed; predial migrate UC3 |
| S4 | unit content-identity force; AGENTS generator | predial force+upgrade |
| S5 | unit sensors; mergePlanes teeth; inventory | superinsights teeth; propia .if |
| S6 | eslint parity with install | 1 Next monorepo |
| S7 | script smoke | nightly |

---

## Release mapping

| Release | Must include | May defer |
|---------|--------------|-----------|
| **4.1.0** (if not yet published) | S0 + ideally S1.1 | S3 large |
| **4.1.1** | S1 + S2 + S4 + S3.1.1–S3.1.2 minimum | SPA profile full, S7 |
| **4.2.0** | S3 complete + S5 + S6 | Z09 |

Honesty in CHANGELOG: never claim “field cohort closed” without S7 green on real clones.

---

## Worked sequence for one implement session (example)

If only one session after this plan is authorized:

1. **FG01** productHonesty (S1.1–S1.4) — highest leverage vs marketing claim  
2. **FG02** monorepo walk-up (S2.1)  
3. **FG04** Domain specificity / vacuum (S3.1.1–S3.1.2)  
4. Re-run amarilla + propia + superinsights doctor extracts  

That triple kills the worst false-green stories from the lab.

---

## Closure checklist (plan done only when)

- [ ] Every gap ID in Inventory section is `done` or `wontfix`+rationale  
- [ ] Every false-green risk has a closed automated or field assertion  
- [ ] UC1–UC10 battery green on mother after changes  
- [ ] 7-repo matrix regenerated; no critical NEW-* open  
- [ ] ROADMAP IDs FG01–FG16 terminal  
- [ ] Docs: product-voice, brownfield, upgrade, start updated  

---

## Evidence pointers (lab)

| Artifact | Path |
|----------|------|
| Gaps JSON | `/tmp/ark-field-lab-95358/reports/FIELD-GAPS.json` |
| Matrix | `…/FIELD-MATRIX.md` |
| UC battery | `…/USE-CASE-BATTERY.md` |
| Deep rules/Plan B | `…/DEEP-ALL-RULES-PLANB-SYNTHESIS.md` |
| Feature validation | `…/FEATURE-4.1.0-VALIDATION.json` |

---

## Appendix — severity × effort matrix (all simple included)

| Effort | IDs |
|--------|-----|
| **S (hours)** | S0.1, S1.2, S1.5, S2.5, S3.1.6, S4.3, S4.4, S4.5, S5.6, S5.7, headline, check script, doctor start |
| **M (1–3 days)** | S1.1, S2.1–S2.4, S3.1.1–S3.1.4, S3.2, S3.3, S4.1–S4.2, S5.1–S5.4, S6.x |
| **L (multi-day)** | Full S3 vacuum+adopt+spa+retrofit; S7 automation |

Nothing in the inventory is “out of plan.” Low/info items still have explicit tasks so they cannot be lost.

---

## One-line plan thesis

**Make green mean green (S1–S2), put files in true homes (S3), stop breaking managed installs (S4), keep dual-plane coherent (S5), prove editor parity and Shape DX (S6), never regress the 7-repo lab (S7).**
