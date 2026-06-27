# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2026-06-28

### Added

- Default shortcut **`,`** (after leader): `\,` thin space.

### Fixed

- **Auto-wrap outside math** works again in plain text that follows closed inline math
  (`$x$` then more text); a backward `$` scan had treated closing delimiters as unclosed
  openers.

## [0.2.2] - 2026-06-21

### Changed

- README / README.zh-CN: clarify that Obsidian installs only `main.js`, `manifest.json`, and
  `styles.css` from releases; document manual `locales-extras.json` install for non-bundled locales.

### Fixed

- Remove unnecessary non-null assertions in `braceNav.ts` (community plugin review).

## [0.2.1] - 2026-06-21

### Added

- **Brace navigation in math** setting (default on): inside `$…$` / `$$…$$`, jump between
  `{…}` fields with **Alt+→** / **Alt+←** (customizable). Does not override Obsidian
  placeholder jump outside math.
- Unit tests for `braceNav`, `math`, and `trie` modules (Vitest).

### Changed

- **Shortcut hints** default to on (`showHintPopup`).
- **Inline math live preview** and **brace navigation in math** default to on.
- Settings keys renamed: `mathBraceNavEnabled`, `mathBraceNavNextKey`, `mathBraceNavPrevKey`
  (legacy `snippetTabStops` / `placeholderNav*` still migrate on load).

### Fixed

- Leader shortcuts inside inline math (`$…$`) no longer wrap snippets in extra `$…$` or
  break into display math.

### Removed

- Deprecated multi-`$$` tab-stop session module (`tabStops.ts`).

## [0.2.0] - 2026-06-21

### Added

- **Smart math toggle** setting (default on): when using Insert inline math or Insert display math
  inside an existing math block, unwrap or convert the block instead of inserting a new one.
  Applies to leader **`D`** as well. Turn off in **Settings → Math Chords** if you prefer
  always inserting a fresh block.
- **Localized UI**: settings, commands, notices, and hint text follow Obsidian's
  display language via `getLanguage()`. Eleven mainstream locales are bundled in `main.js`;
  61 others load from `locales-extras.json` on first use (English fallback).
- **Math environment reorder**: drag rows in settings to change picker order.

### Changed

- Plugin description follows Obsidian marketplace practice: English-only `manifest.json`
  text with search keywords; localized UI after install. README.zh-CN explains the listing
  for Chinese users.
- Release assets now include `locales-extras.json` for on-demand locale loading.

## [0.1.6] - 2026-06-20

### Changed

- Drop deprecated `main` field from `manifest.json` (Obsidian loads `main.js` by default).
- GitHub Releases now attach artifact attestations for `main.js` and `styles.css`.
- Release assets are only `main.js`, `manifest.json`, and `styles.css` (no zip bundle).
- Sync README, README.zh-CN, `.cursorrules`, and `package-lock.json` to v0.1.6.

## [0.1.5] - 2026-06-20

### Fixed

- Remove plugin name from settings tab heading (Obsidian community review).

## [0.1.4] - 2026-06-20

### Fixed

- Address Obsidian community plugin review: replace inline style assignments with CSS
  classes and `setCssProps`, use `Setting.setHeading()` in settings UI, `window.activeDocument`
  / `window.setTimeout` for popout compatibility, `instanceOf(HTMLElement)` for cross-window
  checks, and typed YAML parsing.

## [0.1.3] - 2026-06-20

### Changed

- **Plugin id** renamed to `math-chords` (Obsidian community directory requirement).
- **minAppVersion** raised to `1.5.0`.
- Settings UI, notices, and hint text are now in English.
- Built-in command hotkeys removed; assign them in Obsidian hotkey settings.
- GitHub Releases attach `main.js`, `manifest.json`, and `styles.css` for community
  installs, plus `math-chords.zip` for manual install.

### Fixed

- Async file and settings operations show a notice instead of failing silently.
- MathJax preview flush errors are caught and logged.
- Inline preview panel sizes to content (inline MathJax, no spurious scrollbars).
- Settings loaded from disk are normalized (types and math environments validated).
- Environment picker re-resolves the display-math region when an environment is chosen.

## [0.1.2] - 2026-06-20

### Fixed

- **Inline math preview** no longer appears blank on the first render; flush MathJax
  styles after `renderMath` and retry once when needed.
- **Environment wrap** places the caret on the blank line inside `\begin{…}…\end{…}`
  instead of after `\end{…}`.

## [0.1.1] - 2026-06-20

### Fixed

- **Insert inline math** (`Ctrl+M`) no longer inserts `$ $` with a space; empty blocks use
  adjacent `$$` delimiters with the caret between them.

### Changed

- **Display-math environment wrap** creates a `$$…$$` block and opens the picker when the
  caret is not already inside display math (Obsidian command and leader shortcut share
  this behavior).
- **GitHub Releases** ship `obsidian-math-chords.zip` (folder named after the plugin id)
  for one-step extract into `.obsidian/plugins/`.

## [0.1.0] - 2026-06-19

### Added

- **Math Chords** Obsidian plugin (`id`: `obsidian-math-chords`): leader-key LaTeX
  chords (`Alt+M` by default) with 101 default shortcuts inspired by LyX math-mode
  bindings plus extension prefixes (`M` / `T` / `W` / `O` / `B`).
- **Caret placeholder** `$$` in snippet templates; optional auto-wrap in `$…$` outside
  math regions.
- **Inline math live preview** using Obsidian's native MathJax while editing `$…$`.
- **Display-math environment wrap** inside `$$…$$` via fuzzy-search picker (default
  `Alt+M` `Shift+E`).
- **Commands:** Insert inline math (`Ctrl+M`), insert display math (`Ctrl+Shift+M`),
  wrap display math with environment.
- **Configuration** via `shortcuts.yaml` and settings UI (search, add, edit,
  delete, reload, merge defaults).
- **Non-destructive merge** on load: appends missing default chords without
  overwriting custom key bindings.
