# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.1] - 2026-07-15

### Fixed

- Removed the redundant product name from the plugin description to satisfy the community directory metadata rules.
- Shortcut group headings now use Obsidian's `Setting.setHeading()` API for consistent settings-page structure and styling.
- Removed the selection converter's registered default hotkey; all built-in command hotkeys are now assigned explicitly by users in Obsidian settings.
- Release validation now rejects redundant product naming and registered default command hotkeys before publication.

## [0.3.0] - 2026-07-15

### Added

- Commands to safely convert LaTeX `\(...\)` / `\[...\]` delimiters in the selection or current Markdown file, with protected-region parsing and single-step undo.
- Optional automatic conversion of pasted LaTeX math delimiters (off by default).

### Changed

- Inline/display math commands now follow one deterministic rule set: a non-empty selection is wrapped, the matching command always unwraps at a caret, and Smart math toggle controls cross-kind conversion only.
- Display-to-inline conversion normalizes multiline content to a valid single-line formula while preserving the mathematical text and caret position.
- The settings page now uses grouped, responsive shortcut rows with derived MathJax previews, readable keycaps, in-place search filtering, accessible row actions, and confirmed deletion; math environments retain direct drag-to-reorder handling in a more consistently aligned table.
- Shared Markdown protection and math-region parsing now runs in linear time and is reused by delimiter conversion, preview, brace navigation, and snippet auto-wrap.
- CI and releases validate locale and version metadata; GitHub Actions are pinned to audited commits.
- README introductions and plugin metadata now describe both core responsibilities: structured LaTeX input and context-aware delimiter normalization for imported text.
- AI-assistance documentation now defines its scope, human accountability, verification limits, privacy and provenance requirements, and contributor disclosure expectations.
- Repository guidance is unified around Codex-compatible `AGENTS.md` and bilingual contribution guides; obsolete Cursor-specific rule files were removed.
- The bilingual project roadmap now records a safe, document-scoped design for possible future LaTeX macro support without relying on undocumented global MathJax mutation.
- Generation and validation scripts now share locale definitions, detect stale generated artifacts and shortcut YAML, and expose a single `npm run check` verification path.
- Delimiter editor transactions are separated from pure parsing, and overlapping selections no longer duplicate conversion counts.

### Fixed

- Cross-kind math commands no longer create nested delimiters when Smart math toggle is disabled; the note is left unchanged and a notice explains the setting.
- Math toggle detection is independent of selection direction, respects exact delimiter boundaries, and remains available for explicitly invoked edits in large notes.
- Shortcut YAML is validated atomically, duplicate canonical key sequences are rejected, failed writes no longer leave in-memory shortcut state out of sync, and leader sequences support configured modifier chords.
- Leader input now cancels safely for IME composition and ignores key-repeat noise; preview and hint DOM/timers use the active editor window in Obsidian popouts.
- Locale state is refreshed on plugin reload, and synchronous MathJax preview failures no longer escape into the editor update loop.
- Cancelling the display-environment picker no longer inserts an empty math block; choosing an environment creates and wraps display math in one transaction and one Undo step.
- Caret placement after transactions is calculated against the resulting document, preventing line/ch drift when a math toggle or environment edit adds line breaks.
- An intentionally empty math-environment list now remains empty after plugin reload instead of being replaced by defaults.
- Settings and shortcut write failures now produce one actionable notice instead of duplicate notices from nested error handlers.
- Settings and shortcut writes are serialized from immutable snapshots so rapid UI changes cannot complete out of order or persist a later-mutated object accidentally.
- Key-setting fields now validate and persist complete values on blur instead of saving transient incomplete chords on every keystroke.
- Shortcut hints and inline previews now clamp to the active window and flip around the caret when there is insufficient viewport space.
- Disabling hints, previews, leader handling, or environment wrapping now clears pending leader state and refreshes every open Markdown editor immediately.
- The leader-key master switch no longer disables the independently configured inline-preview feature.
- Closing an Obsidian popout now removes its document-level keyboard listener immediately instead of retaining the closed window until plugin unload.
- Shortcut previews now separate placeholder samples from TeX control words, fixing MathJax rendering for Angle brackets, Floor, and Ceiling.
- Shortcut previews now wait for MathJax initialization before rendering, preventing every formula preview from degrading to a dash when settings are opened first in a new Obsidian session.
- Shortcut rows now use their two-line height more effectively with a larger, consistently aligned MathJax preview column on desktop and narrow settings panels.
- The settings introduction now explains both core workflows and the supporting editor features, uses the full settings content width without an artificial empty column, and is synchronized across bundled and extra locale resources.
- Literal `+` shortcut parsing, shifted-punctuation fallback, and persisted key-setting validation now handle common keyboard layouts and reject incomplete chords.
- Currency text is no longer mistaken for existing Markdown math during delimiter conversion.
- Unclosed HTML `<pre>` / `<code>` blocks, fenced code, inline code, YAML frontmatter, and existing Markdown math remain untouched.
- Selection conversion handles all editor selections in one transaction, and paste conversion respects earlier paste handlers.

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
