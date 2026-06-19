# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
