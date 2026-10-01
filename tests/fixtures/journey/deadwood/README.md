# Deadwood

A small Next-like tree used as a packed-tarball journey fixture for the
files-nothing-imports advisory (ADR 0037). One file nothing imports, one file
only a test imports, one file behind `import.meta.glob`, entry points from
Next conventions, `package.json` `exports` mapped through `tsconfig`
`outDir` / `rootDir`, and one glob in `.ark/entry-points.json`. Nothing here
is fetched at test time.
