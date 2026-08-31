# ArkGate documentation

**Write. Check. Ship.**

**When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.**
Not an API Gateway. Not a folder linter. If the check is not required on the PR, the config
is just documentation.

Pick your path. Skip everything else.

| You are… | Start here |
|----------|------------|
| **Anyone** using AI to build a TypeScript app | [Use ArkGate](use.md) |
| **A developer** wiring agents, CI, brownfield, or config | [Develop with ArkGate](develop.md) |
| **Contributing** to the library itself | [Contribute](../CONTRIBUTING.md) |

Product site: [arkgate.online](https://www.arkgate.online/) · npm: [`arkgate`](https://www.npmjs.com/package/arkgate) · Source: [GitHub](https://github.com/pedroknigge/arkgate)

---

## Quick map

### Use (product)
| Doc | What it is |
|-----|------------|
| [use.md](use.md) | One flow: install → doctor → day-to-day |
| [enthusiast/](enthusiast/README.md) | Tutorials and plain-language track |
| [demos/](demos/) | Short end-to-end demos |
| [product-voice.md](product-voice.md) | How ArkGate should sound (Write. Check. Ship.) |

### Develop (integrate)
| Doc | What it is |
|-----|------------|
| [develop.md](develop.md) | Gates, hosts, config, brownfield, power tools |
| [ai-gates.md](ai-gates.md) | Install hooks / MCP / CI per host |
| [agent-guide.md](agent-guide.md) | Agent, CLI, and MCP reference (incl. `ark status --json` / MCP `ark_status`) |
| [diagnostics.md](diagnostics.md) | Public diagnostic `ruleId` catalog (why / fix anchors) |
| [configuration.md](configuration.md) | `ark.config.json` contract |
| [arkorder.md](arkorder.md) | Optional ArkOrder extra: library + sensors, not a service |
| [brownfield-adoption.md](brownfield-adoption.md) | Existing messy repos |
| [package-surface.md](package-surface.md) | Stable vs experimental package surface |
| [typescript-support.md](typescript-support.md) | TS 5 / 6 / 7 analysis boundary |

### Contribute (library)
| Doc | What it is |
|-----|------------|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, rules, PR/release |
| [ROADMAP.md](../ROADMAP.md) | Live implementation queue (one `doing` at a time). History: [archive/roadmap-history.md](archive/roadmap-history.md) |
| [adr/](adr/README.md) | Architecture decisions ([0032](adr/0032-writes-via-aggregate-sensor.md) writes-via-aggregate · [0033](adr/0033-arkorder-runtime-half-is-arkrun.md) ArkOrder runtime half · [0034](adr/0034-arkorder-valved-loop.md) valved loop) |
| [SECURITY.md](../SECURITY.md) · [threat-model.md](threat-model.md) | Security |

---

## History and maintainer material

These are **not** the day-to-day product path. They stay in the repo for evidence and maintainers:

| Area | Path |
|------|------|
| Release notes (by version) | [releases/](releases/) · npm [CHANGELOG.md](../CHANGELOG.md) (Unreleased + 4.6.x) · [pre-4.6 archive](archive/CHANGELOG-pre-4.6.md) |
| Epic plans | [plans/](plans/) — maintainer seeds, not required to use the package. Live: [alive-in-six-months](plans/alive-in-six-months/README.md) (`AL01`–`AL04` done; `AL05` parked). [arkrun](plans/arkrun/README.md) (Phase RN; `RN01`–`RN17` done; shipped **4.7.0** + companion **4.7.4**; ADRs [0020](adr/0020-arkrun-gated-extra-plane.md)–[0024](adr/0024-arkrun-transport-ports.md) accepted). [one-catalog-one-root](plans/one-catalog-one-root/README.md) (Phase HS; `HS01`–`HS05` done; shipped **4.7.1**). [arkorder](plans/arkorder/README.md) (Phase OR; `OR01`–`OR07` done; shipped **4.8.0**; extra **inside** package `arkgate` as `arkgate/order`; ADRs [0027](adr/0027-arkorder-gated-extra-plane.md)–[0031](adr/0031-one-package-extras-deprecate-companion.md)). [arkorder-arkrun](plans/arkorder-arkrun/README.md) (Phase XP; `XP01`–`XP08` done; shipped **4.8.5**; ADR [0033](adr/0033-arkorder-runtime-half-is-arkrun.md)). [arkorder-valve-loop](plans/arkorder-valve-loop/README.md) (Phase LV; `LV01` done; `LV02`–`LV09` `todo`; valved Haken loop; target **4.9.0**; [ADR 0034](adr/0034-arkorder-valved-loop.md); does not close K01). |
| Claims audit | [audit/claims-matrix.md](audit/claims-matrix.md) |
| Field adoption kit (scaffolding, not closed) | [field/](field/) |
| Runtime hardening (experimental) | [production-hardening.md](production-hardening.md) |

Current published: [releases/4.8.5.md](releases/4.8.5.md) (`arkgate@4.8.5` on npm `latest`; does not close `K01`).
Prior: [releases/4.8.4.md](releases/4.8.4.md) · [releases/4.8.3.md](releases/4.8.3.md) · [releases/4.8.2.md](releases/4.8.2.md) · [releases/4.8.1.md](releases/4.8.1.md) · [4.8.0](releases/4.8.0.md) · [4.7.6](releases/4.7.6.md) · [4.7.5](releases/4.7.5.md) · [4.7.4](releases/4.7.4.md) · [4.7.3](releases/4.7.3.md) · [4.7.2](releases/4.7.2.md) · [4.7.1](releases/4.7.1.md) · [4.7.0](releases/4.7.0.md) · [4.6.7](releases/4.6.7.md) · [4.6.6](releases/4.6.6.md) · [4.6.5](releases/4.6.5.md) · [4.6.4](releases/4.6.4.md) · [4.6.3](releases/4.6.3.md) · [4.6.2](releases/4.6.2.md) · [4.6.1](releases/4.6.1.md) · [4.6.0](releases/4.6.0.md).
Older notes: [releases/](releases/). Config: [configuration.md](configuration.md).

---

## Principles for these docs

1. **Audience first** — every page should be use, develop, or contribute.
2. **One primary flow** — `start` → doctor → optional guided work.
3. **Honest hardness** — host write guarantees differ; a **required GitHub status context** running the merge CLI is the shared hard boundary.
4. **History is not the product** — version archaeology lives under `releases/` and `plans/`, not the front door.
5. **Common language** — first-contact copy uses ordinary software words (import rules, the write doesn’t land, required CI). ArkGate is import rules; ArkRules is policies; ArkRun is an experimental runtime; ArkOrder stops the agent rewriting the few slow product decisions as CRUD. Voice: [product-voice.md](product-voice.md).
