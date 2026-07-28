# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.5.9] - 2026-07-28

### Fixed

- Restored publication WASM support for `sloped` labels on straight paths, including upright line-angle rotation and matching measured-label offsets in Markdown and PDF export.
- Added bounded WASM support for nested `scope` environments with coordinate `shift`, including nodes, paths, inline labels, bounded plots, stepped `\foreach` conductor diagrams, and both arrow directions.
- Routed path labels that combine `sloped` with an explicit `rotate` back to local TeX instead of silently overriding the requested rotation.
- Corrected the author name from `CHEH Hua` to `CHEN Hua` across plugin metadata and project documentation.

## [0.5.8] - 2026-07-28

### Added

- Expanded the bounded publication WASM renderer with common STEM TikZ vocabulary: tuple `\foreach` variables; polar, relative, and named coordinates; grids and closed polygons; classic and key-value arcs; radius-form circles; inline path labels; circular nodes; standard Stealth and Latex arrow tips; and common line weights, dash patterns, colors, and opacity controls.
- Added a systematic STEM compatibility corpus with more than 100 focused native-versus-fallback assertions, 39 Rust renderer tests, and 12 compiled-WASM smoke diagrams.

### Changed

- Routes advanced library and path semantics—including `pgfplots`, `circuitikz`, scopes and transforms, calc coordinates, patterns and decorations, matrices and graphs, clipping and shading, 3D coordinates, curved-path labels, and curved-path shortening—to Automatic or local TeX instead of silently approximating them.
- Documented the built-in renderer's publication subset and its explicit local-TeX fallback boundary in both READMEs.

### Fixed

- Matched common coordinate graphs more closely to TeX, including explicit directional node gaps, dotted grayscale grids, and bounded smooth coordinate plots.
- Reconciled named-node connector endpoints and arrowheads after final browser and MathJax measurement so Markdown rendering and PDF export use the same completed geometry.
- Sized circular nodes around the diagonal of their measured content box, distinguished path operators from similarly named coordinates, and rejected adversarial grid steps before integer conversion.

## [0.5.7] - 2026-07-28

### Fixed

- Removed redundant TikZ print `!important` declarations and replaced the partially supported multicolumn break property with its print-specific compatibility form.

## [0.5.6] - 2026-07-28

### Changed

- Raised the minimum supported Obsidian version for new installations to 1.7.2 while preserving earlier release mappings for existing users.

### Fixed

- Added bounded English TeX-pattern hyphenation to fixed-width WASM text nodes, matching local TeX line breaks and preventing long timeline boxes from drifting into adjacent content.
- Batched TikZ label measurement before SVG mutation, coalesced concurrent MathJax completion work, and cached targeted TeX font loads per document instead of waiting on every theme font for every diagram.
- Matched supported WASM node geometry more closely to local TeX for publication-style diagrams, including named node styles, cardinal anchors, text widths, independent padding, font formatting, rounded corners, fills, outer separation, and picture-level line weight.
- Reapplied TikZ node anchors and resized node backgrounds from the completed browser/MathJax layout, then embedded that result in the SVG so Markdown, Better Export PDF, and direct preview exports share one geometry.
- Matched WASM centimeters, TeX points, fonts, strokes, and node dimensions to the PDF-point coordinate system used by local TeX instead of applying an extra CSS-pixel enlargement.
- Used declared TikZ minimum dimensions rather than estimated fallback text boxes when fitting measured browser labels, preserved explicit left alignment against theme styles, and cropped the completed SVG to its real content.
- Reused Obsidian's loaded MathJax TeX text faces for default Latin WASM labels, including matching bold and italic faces, so browser line wrapping and node heights track local Computer Modern output instead of Times New Roman metrics.
- Replaced print-fragile SVG arrow markers with portable path geometry and kept MathJax label overlays transparent, preserving arrowheads and underlying diagram fills in Markdown and PDF output.
- Added publication-compatible rotated node labels, aligned positioned formulas by their complete TeX node boxes, and stopped post-overlay SVG bound feedback from progressively shrinking tall diagrams.
- Forced fixed-width publication nodes to wrap and hyphenate inside their declared TikZ text width, and measured TeX arrow commands as glyphs instead of command text so event and summary boxes use realistic heights.
- Added bounded `plot[smooth] coordinates` support using PGF's default smooth-plot tension and endpoint controls, without treating coordinate-based field lines as unsupported parametric plots.
- Tightened the WASM capability contract across picture, path, plot, node-alignment, shift, line-weight, arrow-tip, and spaced-assignment options so unsupported syntax falls back to local TeX instead of rendering with silently ignored or substituted styles.

## [0.5.5] - 2026-07-28

### Changed

- Raised both renderer paths to publication-oriented vector output: supported WASM diagrams stay SVG, ordinary local TeX diagrams prefer the DVI-to-SVG path, and PDF-producing engines convert to path-based SVG when the installed `dvisvgm` has PDF support while retaining the original vector PDF for direct export.

### Fixed

- Added WASM support for bounded TikZ arcs, parenthesized ellipse radii, chained cubic Bézier segments, local node font sizes, named path styles, and line shortening.
- Routed advanced TeX text boxes and other unsupported constructs to local TeX before the WASM worker starts, avoiding misleading partial Markdown renders.
- Increased the bounded PDF fallback resolution for print rendering while preserving memory and dimension limits.
- Refreshed every open Markdown view and active editor preview immediately after changing the TikZ backend, without requiring users to reopen individual source blocks.
- Embedded calibrated MathJax labels inside each WASM SVG before display or export, preventing labels from escaping their diagram, overlapping nearby content, or shifting during PDF pagination.
- Let Reading-view TikZ containers follow the rendered SVG's natural height without internal scrollbars, while retaining contained scaling in the floating preview.
- Preserved renderer margins for strokes and markers, added visible arrow-paint fallbacks and reverse arrows, and isolated every SVG definition ID so arrows, clips, masks, gradients, and glyph references remain correct across multiple diagrams and rerenders.
- Made SVG snapshots self-contained with resolved presentation styles, and kept print waiting on the public asynchronous Markdown processor contract without relying on private Obsidian fields.
- Recorded PDF-to-SVG converter failures in native-render diagnostics and stopped retrying a converter that already failed until the backend is restarted.

## [0.5.4] - 2026-07-28

### Fixed

- Ensured TikZ diagrams render before print-oriented Markdown processors finish, so PDF exporters capture the completed diagram instead of its source code.

## [0.5.3] - 2026-07-28

### Fixed

- Removed the remaining WASM worker audit warnings by compiling the embedded bytes to an explicit WebAssembly module before instantiation.
- Kept preview export dialog selection and filesystem writes on the same Obsidian window so exports remain reliable from popout windows.

## [0.5.2] - 2026-07-28

### Fixed

- Removed the remaining source-audit warnings by replacing the generic desktop runtime bridge with capability-specific validated adapters and by creating detached preview elements through Obsidian's DOM helpers.

## [0.5.1] - 2026-07-27

### Changed

- Documented the exact filesystem, process, export-path, and clipboard boundaries of the optional desktop integrations.

### Fixed

- Replaced untyped desktop module loading with a validated, allowlisted bridge while preserving local-TeX detection, compilation, and file export.
- Switched HTML and SVG construction to Obsidian DOM helpers so previews and exports retain the correct owner document in popout windows.
- Removed obsolete lint exceptions, unnecessary WebAssembly assertions, and a partially supported scrollbar declaration.

## [0.5.0] - 2026-07-27

### Added

- Added optional TikZ code-block rendering in Reading view and Live Preview. The feature is disabled by default to avoid conflicts with other rendering plugins.
- Added a lightweight built-in Rust/WASM renderer that works without TeX, downloads, or additional plugin files. It supports common paths, nodes, flowcharts, formulas, loops, numeric macros, ellipses, plots, fills, and arrow styles.
- Added Automatic and local-TeX backends. Automatic mode uses the built-in renderer when possible and can use an installed TeX system for unsupported TikZ features.
- Added automatic detection for LuaLaTeX, XeLaTeX, pdfLaTeX, traditional LaTeX with `dvisvgm`, and Tectonic, with optional executable-path and CJK font overrides.
- Added a draggable and resizable TikZ preview window with SVG, PNG, JPEG, and PDF export through the system save dialog.
- Added bounded memory and persistent render caches, viewport-aware scheduling, diagnostics, cache clearing, renderer restart, and optional `% alt:` accessibility descriptions.
- Added persistent template favorites and a 12-item recent-template list to the formula panel.
- Added `Shift+B` as the default shortcut for inserting `\boldsymbol{}`.
- Bundled all 72 supported interface languages for complete offline use.
- Added English and Chinese architecture documentation for the TikZ renderer, preview pipeline, caching, localization, and release layout.

### Changed

- Changed the default `D` shortcut from a display-math block to `\mathrm{d}` with the cursor placed after the command.
- Kept the standard Obsidian three-file installation layout while including the built-in renderer and all interface languages in `main.js`.
- Made TikZ backend changes refresh open Markdown views immediately.
- Reorganized TikZ and font settings so advanced paths and CJK options stay collapsed until enabled.
- Unified add buttons, section indentation, and spacing across shortcut, math-environment, and template management.
- Reduced production bundle size and startup work through minification, lazy renderer loading, compressed embedded assets, and expansion of only the active locale.

### Fixed

- Fixed first-run TikZ activation after plugin data is cleared.
- Improved preview responsiveness while typing and kept the source or previous successful render visible until a replacement is ready.
- Prevented preview-panel jitter by measuring and swapping completed output atomically outside CodeMirror layout.
- Improved visual consistency between WASM and local TeX for diagram scale, SVG cropping, arrows, fills, curves, plots, flowcharts, multiline labels, CJK text, and mixed text-and-math baselines.
- Improved formula positioning and sizing for bold symbols, subscripts, relative node placement, font-size commands, `inner sep`, and white label backgrounds.
- Routed unsupported syntax safely to local TeX in Automatic mode instead of displaying a partial or misleading WASM result.
- Hardened generated SVG handling, external URL filtering, TeX input and artifact limits, worker cancellation, cache bounds, and generated-asset verification.
- Fixed local TeX compatibility with common TeX Live installations and Unicode font loading.

## [0.4.2] - 2026-07-22

### Fixed

- Created the formula-panel drop cursor through the editor's Obsidian window helpers, satisfying the DOM-helper rule while retaining popout-window ownership.

## [0.4.1] - 2026-07-22

### Fixed

- Replaced direct DOM element creation in the formula-panel drop cursor with Obsidian's element helpers while preserving popout-window ownership.
- Replaced the unsupported CSS `:dir()` pseudo-class with Obsidian's RTL body state for compatibility with the declared minimum app version.

## [0.4.0] - 2026-07-22

### Added

- Added a persistent template tree to the formula panel with named Markdown templates, direct template creation at the root or inside folders, recursive folders, click/drag insertion, cross-folder reordering, settings-page management with matching free drag-and-drop reordering, and persistent collapse controls including the panel-wide expand/collapse action. Empty folders are supported and no longer receive automatic placeholder templates.
- Localized all formula-panel template and template-management UI added in this release across every supported language catalog.
- Updated the settings-page introduction to describe reusable Markdown and formula templates alongside the core math-writing tools, with concise wording across all 72 supported locales.
- Reworked the bilingual README and plugin description around Math Chords' complete math-writing workflow, with detailed guidance for reusable formula templates and general Markdown insertion.
- Added confirmed delete actions for template folders and templates directly in the formula panel, matching template management in settings.

### Fixed

- Made template blocks insert their Markdown content into the active note when clicked instead of responding only to drag gestures.
- Made formula cards, math environments, and template titles/previews support real editor drag-and-drop insertion at a visible drop cursor instead of falling back to the editor's previously selected caret position; template handles remain available for tree reorganization.
- Made empty inline and display math placeholders switch, unwrap, and accept shortcut insertion deterministically without producing repeated dollar delimiters, while preserving document line endings and valid inline boundary whitespace.

## [0.3.4] - 2026-07-16

### Changed

- Adopted Obsidian 1.13's declarative settings definitions for settings search while retaining the imperative settings-page fallback for the declared Obsidian 1.5.0 minimum.
- Added a default-on formula-panel setting that removes the sigma ribbon action, closes open formula-panel leaves, and prevents command-based reopening when disabled; re-enabling it restores the action.
- Moved formula-panel drag handles to the left of group names and reordered settings from core input behavior through editing aids, imported-LaTeX handling, environments, and shortcut management.
- Rendered the three matrix-group shortcuts with compact, representative 2-by-2 matrix or two-row cases content in shortcut previews, with extra scaling for cases to prevent clipping and no change to inserted LaTeX.
- Kept compact order and name columns visible while horizontally scrolling the math-environment table, using a direction-aware shadow only after scrolling and automatically releasing the columns below 440px.
- Reworked shortcut-management search into a component-responsive toolbar with full-width search, a stable add action, and clean stacking on very narrow settings panes.
- Made shortcut rows respond to their own container width so previews, key badges, names, commands, and edit actions remain accessible across split and very narrow settings panes.
- Switched settings dialogs to Obsidian's native modal titles so headings align with the fields and descriptive text below them.

## [0.3.3] - 2026-07-16

### Added

- Added an Obsidian-native formula sidebar opened from the ribbon or command palette, with grouped browsing, search, lazy MathJax previews, and click-to-insert behavior backed by the active `shortcuts.yaml` catalog.
- Formula-panel insertion remembers the most recent open Markdown editor, preserves selection and caret behavior, and reports when no valid target note is available.
- Formula-panel groups can now be collapsed and reordered with a drag handle; both preferences persist across restarts.
- The formula panel now includes the configured display-math environments, with representative multi-row previews for `cases`, matrices, `aligned`, and `gathered`, and direct one-transaction insertion or wrapping.
- The formula-panel summary now provides a one-click action to collapse or expand every group.

### Changed

- Shared lazy shortcut-preview rendering between settings and the formula panel, including popout-window-aware observers and lifecycle cleanup.
- The initial formula-panel group order now prioritizes structures, Greek letters, operators, and delimiters according to common daily math-entry frequency.
- Formula-panel totals now use the inclusive term "items" because the panel contains both shortcut formulas and math environments.

### Fixed

- Clicking the sigma ribbon icon now toggles the formula panel closed when it is already open.
- Moved the formula-panel search icon to the right side so it no longer overlaps entered text.
- Collapsing or expanding formula-panel groups now updates the existing DOM in place, preserving rendered MathJax previews and preventing the panel from flashing and shifting twice on every click.
- Pointer clicks on formula-panel actions no longer steal focus from the Markdown editor, preventing Live Preview formulas from collapsing on mouse-down and reopening after insertion.

## [0.3.2] - 2026-07-16

### Added

- Added an Obsidian-aware ESLint gate to the complete local and CI verification path.
- Added bilingual security policies and codes of conduct, structured bug and feature issue forms, a pull request checklist, and grouped Dependabot updates for npm and GitHub Actions.
- Added CI coverage for both the minimum supported Node.js version and the current primary Node.js version.
- Added opt-in Vitest performance baselines for large-note math parsing and imported delimiter conversion.

### Changed

- Moved unit and regression tests from `src/` to `tests/unit/` and updated the TypeScript, Vitest, release validation, and contributor documentation paths accordingly.
- Added an explicit settings schema and automatic migration for legacy brace-navigation keys.
- Reused a document-level math analysis index across preview and insertion queries, parsed protection ranges once for multi-selection delimiter conversion, and skipped paste parsing when no opening delimiter is present.
- Shortcut previews now render near the visible settings viewport and release their observers and timers when the tab is rebuilt or hidden.
- Brace-navigation parsing now runs only for its configured navigation chords instead of every editor keydown.

### Removed

- Removed the obsolete, unreferenced bundle-analysis script left over from the earlier localization rollout.

### Fixed

- Restored compatibility with the declared Obsidian 1.5.0 minimum by using the long-supported Moment locale API instead of `getLanguage()`, which was introduced in Obsidian 1.8.7.
- The default Fraction shortcut preview now renders a complete `\\frac{x}{y}` sample instead of leaving the denominator empty.

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
