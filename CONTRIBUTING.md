# Contributing to Math Chords

[中文指南](CONTRIBUTING.zh-CN.md)

Contributions should preserve the plugin's existing behavior, Obsidian compatibility,
and non-destructive editing guarantees. Read [AGENTS.md](AGENTS.md) before changing
architecture, parsers, generated files, CI, or release metadata.

## Development setup

Use a Node.js version supported by `package.json`.

```bash
npm install
npm run check
```

Use `npm ci` for a clean, lockfile-reproducible installation, as CI and release jobs
do. Do not commit `main.js`, `data.json`, transient script bundles, or dependency
directories.

## Making changes

- Keep changes focused and preserve unrelated work in the repository.
- Add or update tests for behavior and regression fixes.
- Edit `src/defaults.ts`, then run `npm run seed`, when default shortcuts change.
- Edit `src/l10n/locales/en.ts` and `scripts/locale-catalog.json`, then run
  `npm run seed:locales`, when interface text changes.
- Keep `README.md` and `README.zh-CN.md` consistent for user-visible behavior.
- Record notable changes under `CHANGELOG.md` → `Unreleased`.
- Do not change version fields unless the maintainer explicitly authorizes a release.

Delimiter conversion and other multi-edit commands must retain a single-step Undo and
must not modify protected Markdown regions. See [AGENTS.md](AGENTS.md) for the complete
safety invariants.

## Verification

Run the complete automated path before submitting:

```bash
npm run check
```

Also test in Obsidian when a change affects commands, settings, hotkeys, editor focus,
paste handling, popout windows, rendering, or undo history. Describe relevant manual
testing in the pull request.

## Pull requests

Explain the problem, the chosen behavior, affected files, and verification performed.
Call out compatibility or migration effects. Keep generated artifacts in the same
commit as their source changes.

If AI-assisted tools materially shaped the contribution, disclose that use and follow
[AI-ASSISTANCE.md](AI-ASSISTANCE.md). Contributors remain responsible for correctness,
license compatibility, provenance, and confidential information.
