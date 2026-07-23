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
| [use.md](use.md) | One flow: install → doctor → day-to-day |
| [enthusiast/](enthusiast/README.md) | Tutorials and plain-language track |
| [demos/](demos/) | Short end-to-end demos |
| [product-voice.md](product-voice.md) | How ArkGate should sound in English UI |

### Develop (integrate)
| Doc | What it is |
|-----|------------|
| [develop.md](develop.md) | Gates, hosts, config, brownfield, power tools |
| [ai-gates.md](ai-gates.md) | Install hooks / MCP / CI per host |
| [agent-guide.md](agent-guide.md) | Agent, CLI, and MCP reference |
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
| Shipped epic plans | [plans/](plans/) |
| Claims audit | [audit/claims-matrix.md](audit/claims-matrix.md) |
| Field adoption kit (scaffolding, not closed) | [field/](field/) |
| Runtime hardening (experimental) | [production-hardening.md](production-hardening.md) |

Current release notes: [releases/3.9.0.md](releases/3.9.0.md) (`arkgate@3.9.0` on npm `latest`).

---

## Principles for these docs

1. **Audience first** — every page should be use, develop, or contribute.
2. **One primary flow** — `start` → doctor → optional guided work.
3. **Honest hardness** — host write guarantees differ; CI required status is the shared merge boundary.
4. **History is not the product** — version archaeology lives under `releases/` and `plans/`, not the front door.
