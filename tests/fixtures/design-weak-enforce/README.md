# Fixture: ENFORCE + design-weak (P04)

Synthetic spaghetti tree used by `tests/unit/static-check/designWeakEnforce.test.ts`.

- Contract governs all files; **no layer import violations** when scanned as isolated modules.
- Deterministic smells: `facade-sql-in-routes`, `domain-logic-in-ui`, optional `mixed-pattern-cluster`.
- Expected honesty: `goal.met === true` **and** `goal.designWeak === true` with non-empty `patternBets`.
- Claiming “healthy finished” while ignoring residual must fail `assertNotHealthyFinishedIgnoringDesign`.
