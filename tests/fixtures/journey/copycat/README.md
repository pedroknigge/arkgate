# Copycat

A small tree used as a packed-tarball journey fixture for the copies-across-a-wall
advisory (ADR 0038). Three planted copies cross a boundary the config draws:

- `features/billing` ↔ `features/invoices`: a slice wall (`peerIsolation`) with
  `sharedRoots: ["shared"]`. Listed as `cross-slice`, destination `src/shared/`.
- `modules/catalog/search` ↔ `modules/catalog/browse`: two child slices of one
  universe (`childSlices`). Listed as `cross-sibling`, destination
  `src/modules/catalog/common/`.
- `domain` ↔ `application/signup`: two layers where Application may import
  Domain. Listed as `cross-layer`, destination the Domain layer.

A copy inside `features/billing` (same slice) is counted, never listed. A copy
in `features/payments` carries an `@generated` header and is never
fingerprinted. Nothing here is fetched at test time.
