# ArkGate product voice

Canonical English for README, CLI first-run copy, skills, and release notes.
When this file disagrees with shipped strings, **fix the strings**.

Internal ADRs, the implementation queue, and code comments are not this file.

---

## Mission

**Write. Check. Ship.**

When the agent writes a bad import, the write doesn’t land.
The same check fails the pull request.

**ArkGate** is import rules for AI-written TypeScript. Always on once you adopt it.

**ArkRules** is optional policies inside a layer.

**ArkRun** is an optional runtime (`@arkgate/runtime`). Experimental. In-memory.
Not Postgres.

```text
Write.   the agent writes
Check.   bad imports don’t land — same check on the PR
Ship.    required GitHub check, then merge
```

```text
ArkGate   always     import rules (write + required CI)
ArkRules  optional   policies inside a layer
ArkRun    optional   experimental runtime — in-memory, not Postgres
```

Status first (`arkgate-check --doctor`). One next step. CLI flag `--doctor` stays;
human copy says **status**.

---

## Locked first-contact

On README, use, develop, the docs hub, and the product site:

1. **Verbs:** `Write. Check. Ship.`
2. **Deny:** `When the agent writes a bad import, the write doesn’t land. The same check fails the pull request.`
3. **Not-that (below the fold, one line):** `Not an API Gateway. Not a folder linter. If the check is not required on the PR, the config is just documentation.`
4. **Nouns (once, below the deny):** ArkGate is import rules. ArkRules is optional policies. ArkRun is an optional experimental runtime.

Do not lead with folders, `ark.config.json`, “contract”, “gate”, “house”, or “doctor”
as the first noun. Historical: `If the AI writes an illegal import, the write is rejected`
and `One architecture config. One check. One coach.` — never first.

H1 may be **ArkGate — Write. Check. Ship.** npm description stays the deny.
ADR 0001 keeps the public name **ArkGate**.

---

## How it sounds

Short. Product nouns. Scene English (Vercel / Supabase / GitHub Checks).
The check is the product — not a metaphor.

Three beats when a line teaches:

```text
[plain fact]. [what it means]. [one next action].
```

| Yes | No |
|-----|----|
| The agent imported Infrastructure from Domain. The write didn’t land. Next: `/ark-place`. | Ship it 🚀 crush the spaghetti |
| Import rules pass. The tree still needs a refactor. Next: one small change. | You don’t need to understand anything |
| ArkRun is experimental. In-memory. Data is gone on restart. | The kernel is production-ready |
| Status: one light, one next step. | Become an architect in 60 seconds |

**Brands, then the common word:** ArkGate, ArkRules, ArkRun. Gloss once.

| Say | Do not say on first contact |
|-----|-----------------------------|
| the write doesn’t land / blocked | write firewall, write checkpoint, co-pilot, the house stays up |
| required CI check / fails the pull request | merge teeth, extra plane |
| **config** (`ark.config.json`; alias: **rules file**) | the contract, the constitution, the manifesto (except the honest “just documentation” line) |
| `arkgate-check --doctor` — **status**, one next step | control plane, coach, doctor as the product name |
| optional policies inside a layer | dual plane, intra-layer sensors, Saturday tidy |
| experimental runtime / in-memory / not Postgres | production kernel, durable runtime, training wheels |

Command names stay command names (`--doctor` is a flag). If a word is not here,
cut it or put it below the fold (develop, JSON, ADRs).

---

## Still true (do not dilute)

These are product law, not vibe:

- **Write. Check. Ship.** ArkGate is the wedge. ArkRules and ArkRun never determine the `arkgate` package shape.
- The check is deterministic. No LLM pass/fail. Skills and `AGENTS.md` never replace the check.
- No numeric architecture / trust / depth score. Lights and counts, never Excellent/Good.
- Green imports ≠ elegant design. Leftover design work is **needs a refactor**, not “done”.
- No silent auto-reshape. Invoke of a command is the approval.
- A weaker config needs an explicit, hash-bound yes.
- Host write hardness differs. Required CI is the shared hard line.
- ArkRun stores are **in-memory**. Not production durability. Do not imply otherwise.
- Absence of ArkRules or ArkRun is silent. Label leftovers **`[Layer]`** vs **`[ArkRules]`**.

Full engineering queue: [ROADMAP.md](../ROADMAP.md). Do not narrate phase ids in consumer copy.

---

## Status (CLI: `--doctor`)

| Light (JSON) | Human | Line |
|--------------|-------|------|
| **Suggest** | **Setup** | New or thin tree. Finish `start`, then status again. |
| **Adapt** | **In progress** | Not fully protected yet. Do action **#1**. |
| **Enforce** | **Ready** | Import rules pass. Keep the write path and required CI. |
| **Enforce · leftover design work** | **Ready · needs a refactor** | Import rules pass; leftover design work remains. Next: one small change. |

Print **All checks passed** only when merge is a **required** status running
`arkgate-check --strict-merge`, there is no leftover design work, and no open
top action. Advisory-only is honest. It is not that string.

Deny:

```text
[What failed in plain terms]. [ruleId]. Next: [one fix].
```

Never mock. Never “disable the rules to finish.” Never mix the config into
a product PR — that is an owner `--contract-session` (config change).

---

## Avoid (short)

- Fowler Gateway / API Gateway / facade / “abstraction layer” as the first sentence
- Leading with folders or the config before Write. Check. Ship. / the deny
- “Contract” as the first noun (without required CI the file is documentation — say so)
- Emoji rain, crush-it, fake amigo, “you don’t need to understand”
- Auto-fix-everything / magic codemod
- Suggest / Adapt / Enforce as settings you pick — they are lights (Setup / In progress / Ready)
- Skill-shopping thirteen names as onboarding
- “Healthy / done” while leftover design work remains
- “MCP is active” because a file exists
- Package AI decided pass/fail
- Depth scores, trust scores, Excellent module bands
- ArkRun as Postgres, an outbox, or Temporal
- New skill *names* without a live queue item
- “the house stays up” / “training wheels” / “mimo” on first contact

---

## Progressive disclosure

```text
npx arkgate start → start --apply → arkgate-check
                 → (optional) skill pack → one command
```

Five commands, not a menu exam: adopt · place · autopilot · explore · upgrade.
Invoking a command **is** the approval. CLI checks; it does not silently rewrite.

---

## Checklist before shipping copy

- [ ] **Write. Check. Ship.** is on first-contact.
- [ ] Deny is `When the agent writes a bad import, the write doesn’t land.`
- [ ] One next action is obvious.
- [ ] ArkGate / ArkRules / ArkRun are import rules / policies / experimental runtime.
- [ ] ArkRun is never implied durable / Postgres.
- [ ] Status lights read Setup / In progress / Ready to humans.
- [ ] No score, no false done, no Gateway as the first sentence, no “disable the rules”.
- [ ] A senior would paste the line into a PR without cringing.
