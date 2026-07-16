# Math Chords Repository Guide

This file is the canonical implementation and workflow reference for OpenAI Codex,
maintainers, contributors, and other coding agents that support `AGENTS.md`.
User-facing behavior belongs in `README.md` and `README.zh-CN.md`; AI-use disclosure
belongs in `AI-ASSISTANCE.md` and `AI-ASSISTANCE.zh-CN.md`.

The repository intentionally has no project `.codex/config.toml`. Add one only when
the project needs a reviewed, repository-specific Codex setting such as sandbox,
approval, MCP, hook, or agent configuration. Personal model and provider preferences
belong in the user's Codex configuration, not in this repository.

## Product scope

Math Chords is an Obsidian plugin for two related tasks:

1. entering common LaTeX structures through leader-key sequences; and
2. normalizing imported `\(...\)` and `\[...\]` delimiters to Obsidian Markdown
   math delimiters without modifying formula contents or protected Markdown regions.

The plugin also provides optional inline preview, brace navigation, smart math
insertion, and display-math environment wrapping. Do not reintroduce removed overlay
UI, multi-placeholder tab-stop sessions, or bundled math-rendering libraries without
an explicit design and compatibility review.

## Source of truth and generated files

- `src/defaults.ts` is the source of truth for default shortcuts.
  `npm run seed` generates `shortcuts.yaml`; `npm run check:shortcuts` detects drift.
- `src/l10n/locales/en.ts` defines translation keys and English text.
- `scripts/locale-catalog.json` is the source of truth for non-English translations.
  `npm run seed:locales` generates bundled locale modules,
  `src/l10n/bundled.ts`, `src/l10n/locales/index.ts`, `src/l10n/lazy-codes.ts`, and
  `locales-extras.json`.
- Do not edit generated locale files or `shortcuts.yaml` directly. Change their
  source files and regenerate them.
- `main.js` is a build artifact and must not be edited manually.
- `scripts/.defaults.cjs` is transient and must remain ignored and absent after the
  shortcut generator exits.

## Module responsibilities

| Module | Responsibility |
| :--- | :--- |
| `main.ts` | Plugin lifecycle, Obsidian registration, leader wiring, and user notices. |
| `delimiterConverter.ts` | Pure context-aware delimiter discovery and text conversion. |
| `delimiterEditor.ts` | Obsidian editor transactions for selection, document, and paste conversion. |
| `markdownProtection.ts` | YAML, fenced/inline code, HTML comment, and HTML `pre`/`code` protection ranges. |
| `math.ts` | Markdown math-region scanning and snippet insertion decisions. |
| `mathToggle.ts` | Pure inline/display wrapping, unwrapping, and cross-kind conversion planning. |
| `textPosition.ts` | Pure post-edit offset-to-position mapping for editor transactions. |
| `snippet.ts` | Snippet expansion and inline/display insertion text. |
| `braceNav.ts` | Brace-pair navigation inside Markdown math. |
| `mathEnv.ts` | Display-math environment picker and editor transaction adapter. |
| `mathEnvPlan.ts` | Pure single-transaction display-environment planning. |
| `mathPreview.ts` | Inline MathJax preview extension. |
| `leader.ts`, `keys.ts`, `trie.ts` | Leader state, canonical key parsing, and shortcut lookup. |
| `config.ts`, `defaults.ts`, `types.ts` | Shortcut persistence, defaults, and domain types. |
| `inputValidation.ts` | Pure normalization and validation for external command and environment input. |
| `shortcutPresentation.ts` | Pure shortcut search and safe preview preparation for the settings UI. |
| `shortcutPreviewRenderer.ts` | Shared lazy MathJax rendering for shortcut previews. |
| `formulaPanel.ts`, `formulaPanelModel.ts` | Searchable formula sidebar and its pure grouping/filter model. |
| `settings.ts`, `settingsTab.ts` | Normalized settings and localized settings UI. |
| `l10n/` | Language resolution, bundled translations, and optional lazy translations. |
| `errors.ts`, `hint.ts` | Error reporting and optional shortcut hints. |
| `tests/unit/` | Vitest unit and regression tests, kept outside production source. |

Keep pure parsing and transformation logic independent of Obsidian APIs. Place editor
mutation adapters in focused modules and keep `main.ts` responsible for orchestration.
Avoid circular dependencies.

## Behavior and safety invariants

- Mutate notes through the Obsidian `Editor` API. A user-visible command that makes
  multiple edits must use one `editor.transaction()` so one Undo reverts it.
- Delimiter conversion changes delimiters only. It must preserve formula contents,
  whitespace, and line breaks.
- Conversion must not run inside YAML frontmatter, fenced code, inline code, HTML
  comments, HTML `<pre>`/`<code>` blocks, or existing Markdown math.
- Selection conversion operates on complete delimiter pairs wholly contained in a
  non-empty selection. Multiple and overlapping ranges must not duplicate edits or
  counts.
- Paste conversion is opt-in, respects `event.defaultPrevented`, uses the surrounding
  document as parsing context, and does not take over when no conversion is needed.
- Existing Markdown math recognition must distinguish valid delimiters from common
  currency text. Add regression tests before changing these rules.
- A non-empty selection takes precedence and is always wrapped by the requested math
  kind. With only a caret, the matching command unwraps the surrounding math; the
  other command converts it only when Smart math toggle is enabled.
- Cross-kind conversion must never create nested Markdown math. When Smart math
  toggle is disabled, leave the document unchanged and explain how to enable it.
- Key parsing must retain literal `+` keys. Shifted punctuation first tries an
  explicit `Shift+symbol` binding, then the printable-symbol binding, so defaults
  remain usable across common keyboard layouts.
- Keep settings backward-compatible through `normalizeSettings()`. Validate external
  YAML, JSON, clipboard, and saved-setting input before use.
- The 100,000-character guard applies to latency-sensitive caret operations. Whole-
  document conversion is explicitly requested by the user and may scan the full file.
- Use `window.activeDocument` or an element's `ownerDocument` for popout-window DOM
  behavior. CodeMirror access through `editor.cm` is read-only; mutations use the
  Obsidian editor abstraction.
- Keep `PluginSettingTab.getSettingDefinitions()` as the Obsidian 1.13+ settings-search
  source while retaining `display()` as the imperative fallback for the declared
  Obsidian 1.5.0 minimum. Do not call 1.13-only runtime APIs from the fallback path.

## Development and verification

Supported Node.js versions are declared in `package.json`. Install reproducibly with
`npm ci` in CI and release jobs.

- `npm run dev` — watch-mode bundle.
- `npm run lint` — ESLint with the official Obsidian plugin rules.
- `npm run build` — strict TypeScript check and production bundle.
- `npm test` — Vitest suite.
- `npm run bench` — opt-in parser and delimiter-conversion performance baselines.
- `npm run seed` / `npm run check:shortcuts` — generate or verify shortcut YAML.
- `npm run seed:locales` / `npm run check:locales` — generate or verify locales.
- `npm run check:release` — verify package, manifest, lockfile, versions, changelog,
  and README version references.
- `npm run check` — complete local and CI verification path.

GitHub CI must cover the minimum supported Node.js version and the current primary
version. Keep third-party actions pinned to full commit SHAs. Community health files,
issue forms, pull request guidance, the security policy, and Dependabot configuration
live under the repository root or `.github/` in GitHub-supported locations.

For behavior changes, add or update focused tests under `tests/unit/` and run
`npm run check`. Also test
in Obsidian when behavior depends on commands, settings, hotkeys, paste events,
CodeMirror focus, popout windows, or undo history. Automated checks reduce risk but
do not replace relevant application testing.

## Documentation and release discipline

- Keep English and Chinese READMEs behaviorally equivalent. Exact prose may differ,
  but defaults, command names, safety limits, installation steps, and release facts
  must agree.
- Record user-visible and workflow changes under `CHANGELOG.md` → `Unreleased`.
- Keep `package.json`, `package-lock.json`, `manifest.json`, `versions.json`, both
  README release references, and the dated changelog section consistent. Do not
  change the version unless the maintainer explicitly authorizes a release bump.
- Release tags have no `v` prefix and must exactly equal the package version. Published
  releases are treated as immutable; the workflow must fail rather than delete and
  recreate an existing release.
- Release assets are `main.js`, `manifest.json`, `styles.css`, and
  `locales-extras.json`.

## AI-assisted contributions

Treat AI-generated material as an untrusted draft. Review it in context, verify its
provenance and license compatibility, never provide secrets or private vault data,
and disclose material assistance in pull requests. The contributor remains
responsible for submitted work. See `AI-ASSISTANCE.md` for the complete policy.
