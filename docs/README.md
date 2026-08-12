# ArkGate documentation

**ArkGate** keeps AI-written TypeScript inside an architecture you can trust.

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
| [use.md](use.md) | One flow: install → doctor (+ improvement compass) → day-to-day |
| [enthusiast/](enthusiast/README.md) | Tutorials and plain-language track |
| [demos/](demos/) | Short end-to-end demos |
| [product-voice.md](product-voice.md) | How ArkGate should sound in English UI (compass = lenses, not scores) |

### Develop (integrate)
| Doc | What it is |
|-----|------------|
| [develop.md](develop.md) | Gates, hosts, config, brownfield, power tools |
| [ai-gates.md](ai-gates.md) | Install hooks / MCP / CI per host |
| [agent-guide.md](agent-guide.md) | Agent, CLI, and MCP reference (incl. `ark status --json` / MCP `ark_status`) |
| [diagnostics.md](diagnostics.md) | Public diagnostic `ruleId` catalog (why / fix anchors) |
| [configuration.md](configuration.md) | `ark.config.json` contract |
| [brownfield-adoption.md](brownfield-adoption.md) | Existing messy repos |
| [package-surface.md](package-surface.md) | Stable vs experimental package surface |
| [typescript-support.md](typescript-support.md) | TS 5 / 6 / 7 analysis boundary |

### Contribute (library)
| Doc | What it is |
|-----|------------|
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Setup, rules, PR/release |
| [ROADMAP.md](../ROADMAP.md) | Implementation queue (one `doing` at a time) |
| [adr/](adr/README.md) | Architecture decisions |
| [SECURITY.md](../SECURITY.md) · [threat-model.md](threat-model.md) | Security |

---

## History and maintainer material

These are **not** the day-to-day product path. They stay in the repo for evidence and maintainers:

| Area | Path |
|------|------|
| Release notes (by version) | [releases/](releases/) · [CHANGELOG.md](../CHANGELOG.md) |
| Epic plans (seeded + shipped) | [plans/](plans/) — maintainer seeds (e.g. [understandable-ark-4.6](plans/understandable-ark-4.6/README.md) **4.6.0**; [field-upgrade-mcp-truth](plans/field-upgrade-mcp-truth/README.md) **shipped in 4.5.6**; deep-module coach **shipped in 4.5.5**; domain fitness & session truth for **4.5.0**; improvement compass for **4.4.0**; agent contract surface for **4.3.0**). Product how-to stays in use/develop/agent-guide; plans are not required reading to use the package. |
| Claims audit | [audit/claims-matrix.md](audit/claims-matrix.md) |
| Field adoption kit (scaffolding, not closed) | [field/](field/) |
| Runtime hardening (experimental) | [production-hardening.md](production-hardening.md) |

Current published: [releases/4.5.7.md](releases/4.5.7.md) (`arkgate@4.5.7` on npm `latest`).  
Prepared: [releases/4.6.0.md](releases/4.6.0.md) (`arkgate@4.6.0`).  
Prior: [releases/4.4.0.md](releases/4.4.0.md) (`arkgate@4.4.0`).  
Previous: [releases/4.3.0.md](releases/4.3.0.md) · [releases/4.2.1.md](releases/4.2.1.md) · [releases/4.2.0.md](releases/4.2.0.md) · [releases/4.1.1.md](releases/4.1.1.md).  
Previous major: [releases/4.0.0.md](releases/4.0.0.md) (`arkgate@4.0.0`).  
Config: [configuration.md](configuration.md) · Agent skills dual-plane: [agent-guide.md](agent-guide.md).

---

## Principles for these docs

1. **Audience first** — every page should be use, develop, or contribute.
2. **One primary flow** — `start` → doctor → optional guided work.
3. **Honest hardness** — host write guarantees differ; a **required GitHub status context** running the merge CLI is the shared hard boundary.
4. **History is not the product** — version archaeology lives under `releases/` and `plans/`, not the front door.
