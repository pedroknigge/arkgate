# start

`ark start` shows the files it would write. `ark start --apply` writes them.

## Sub-features

- `preview` lists `ark.config.json` and does not create it.
- `apply` writes `ark.config.json` without running the package manager.

## How to get to it (user POV)

- `npx arkgate start`
- `npx arkgate start --apply`
- `/ark-adopt` for a project that does not have a rules file yet.

## Driving it with verify.mjs

Preconditions:

- Doctor prints `doctor ok`.
- The temp copy of `eval/cases/domain-forbidden-global` has no `ark.config.json`.

- **Preview.** Run proof `preview`. Command shape: `node bin/ark.mjs start --root <copy> --yes --no-install`. Exit code `0`. Output contains `no files were changed` and `create ark.config.json`. `ark.config.json` is absent after the command.
- **Apply.** Run proof `apply` on a fresh copy. Command shape: `node bin/ark.mjs start --apply --root <copy> --yes --skip-package-manager`. Exit code `0`. Output contains `Applied` and `start mutation`. `ark.config.json` exists and contains `layers`. `package.json` is still absent.
- **Proof.** `node .cursor/skills/verify-arkgate/verify.mjs --only start`.

## Gotchas

- Preview can still write `.ark/ci-merge-boundary.json`. Absence of `ark.config.json` is the check that preview did not apply.
- `--skip-package-manager` is what keeps apply off the network. The proof still requires the rules file on disk.
- Do not run apply in the ArkGate checkout.
