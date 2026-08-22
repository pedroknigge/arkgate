# Field program kit (Z09 / residual RB-11 / C-028)

**Status: not closed.** This directory is **scaffolding** so retained adoption and
independent close can run honestly. It does **not** close roadmap item `Z09`,
release blocker `RB-11`, or claims-matrix row `C-028`.

| Claim | State |
|-------|--------|
| Z07 10× feedback | Earned in published **3.8.0** |
| Z08 causal productivity | Earned in published **3.8.0** |
| Z10 design-delta + runtime hardness | Earned in published **3.8.0** |
| **Z09 retained adoption + independent close** | **Parked claim gate — open** |
| Residual **RB-11** | **Open** |
| Claims-matrix **C-028** (residual slice) | **Partial** |

Do **not** invent adopter counts, D30/D90 rates, or independent signatures in this
repository without preregistered external evidence. Ordinary corrective patches
and product-surface minors (for example 3.9.0 Beautiful Path) may ship while Z09
remains open.

## What lives here

| Document | Purpose |
|----------|---------|
| [preregistration-template.md](preregistration-template.md) | External matrix targets (repos × hosts × package managers) before clocks start |
| [cohort-retention-checklist.md](cohort-retention-checklist.md) | D30 / D90 retention checklist for consented adopters |
| [independent-reviewer-manifesto.md](independent-reviewer-manifesto.md) | Reviewer independence rules + open decision on signed identity |
| [premortem-report-20260822.html](premortem-report-20260822.html) · [transcript](premortem-transcript-20260822.md) | Product premortem (2026-08-22). Failure modes if retained adoption stays unproven. **Does not close Z09.** |
| ROADMAP `Z09` | Authoritative acceptance thresholds and promotion gate |

## Promotion gate (copy from ROADMAP)

Promote Z09 from `parked` only when **all** of the following exist **before**
D30/D90 clocks start:

1. Signed repository/reviewer identity mechanism is chosen and preregistered.
2. External matrix is preregistered (balanced targets — see template).
3. Cohort of **≥8** consented adopter projects is enrolled.

Then collect evidence. Close residual `RB-11` only when ROADMAP acceptance
thresholds pass with real signed evidence — never with prose alone.

## Related evidence (already earned, not Z09)

- Causal ledger / reports under `eval/causal/` (Z08)
- Adoption / packed journey matrices under `eval/adoption*` (Z05–Z06 historical)
- Beta-exit schemas under `eval/beta-exit/` (historical declaration shape — not
  independent identity proof)

See [ROADMAP.md](../../ROADMAP.md#z09--prove-retained-field-adoption-and-independent-close)
and [claims-matrix C-028](../audit/claims-matrix.md).
