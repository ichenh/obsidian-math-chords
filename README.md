<h1 align="center">Math Chords for Obsidian</h1>

<p align="center">
  <strong>Write and normalize LaTeX math in Obsidian—faster.</strong><br />
  Use leader-key snippets, a searchable formula panel, safe delimiter conversion, inline preview, brace navigation, and display-math environments in one plugin.
</p>

<p align="center">
  <b>English</b> · <a href="README.zh-CN.md">简体中文</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License" /></a>
  <img src="https://img.shields.io/badge/Obsidian-1.5.0%2B-7C3AED?logo=obsidian&logoColor=white" alt="Obsidian 1.5.0 or later" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="https://github.com/ichenh/obsidian-math-chords/releases/latest"><img src="https://img.shields.io/github/v/release/ichenh/obsidian-math-chords?display_name=tag&sort=semver" alt="Latest release" /></a>
  <a href="https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml"><img src="https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml/badge.svg" alt="CI status" /></a>
  <a href="https://github.com/ichenh/obsidian-math-chords/actions/workflows/release.yml"><img src="https://github.com/ichenh/obsidian-math-chords/actions/workflows/release.yml/badge.svg" alt="Release status" /></a>
</p>

**Math Chords** is an Obsidian plugin for writing and normalizing LaTeX mathematics in Markdown notes. It addresses two recurring sources of friction: entering common LaTeX structures character by character, and reconciling text copied from AI tools, papers, or LaTeX sources with Obsidian's Markdown math delimiters.

For direct input, a configurable leader key (default `Alt+M`) followed by a short sequence inserts fractions, Greek letters, integrals, and other snippets. For imported text, explicit commands convert `\(...\)` and `\[...\]` to `$...$` and `$$...$$` in a selection or the current file; the same conversion can optionally run on paste.

The converter changes delimiters only. It preserves formula content, whitespace, and line breaks, and excludes Markdown regions where textual conversion would be unsafe. The plugin also provides optional inline preview, brace navigation within math, and display-math environment wrapping.

Default shortcuts are inspired by [LyX](https://www.lyx.org/) math-mode bindings.

**Current release: v0.3.4.** See [CHANGELOG](CHANGELOG.md).

**Requires Obsidian 1.5.0+.** Keyboard-heavy; desktop recommended.

> **Community plugin browser:** Obsidian shows each plugin's `description` from `manifest.json` in **English only** (the browse UI itself follows your app language). After installation, **Settings → Math Chords** and command names follow your Obsidian display language.

![Math Chords demo: leader shortcuts insert LaTeX with live preview](docs/demo.gif)

---

## Table of contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Formula panel](#formula-panel)
- [Shortcut reference](#shortcut-reference)
- [Display-math environment wrap](#display-math-environment-wrap)
- [Configuration](#configuration)
- [LaTeX delimiter conversion](#latex-delimiter-conversion)
- [Settings](#settings)
- [Updating shortcuts](#updating-shortcuts)
- [Project structure](#project-structure)
- [Development](#development)
- [AI assistance](#ai-assistance)
- [License](#license)

---

## Features

| Feature | Description |
| :--- | :--- |
| **Structured input** | Press a configurable leader key, then a key sequence to insert common LaTeX structures and symbols. |
| **Formula panel** | Browse or search the active shortcut catalog in an Obsidian sidebar and click a rendered formula to insert it. |
| **Caret placeholder** | `$$` in a command template marks where the cursor (or selection) is placed, e.g. `\frac{$$}{}`. |
| **Auto `$…$` wrap** | Optional: when inserting outside math, wrap the snippet in inline math delimiters. |
| **Inline live preview** | While the caret is inside `$…$`, a floating panel above the formula renders with Obsidian's native **MathJax** (on by default). |
| **Brace navigation in math** | Jump between `{…}` fields inside `$…$` / `$$…$$` with configurable keys (default `Alt+→` / `Alt+←`; on by default). |
| **Display-math environments** | Wrap block content with `\begin{…}…\end{…}` via a fuzzy-search picker; inserts `$$…$$` when needed. |
| **Built-in math commands** | Wrap selected text, insert inline/display math, or remove a matching wrapper; optional smart toggle enables conversion between inline and display math. |
| **LaTeX delimiter conversion** | Convert `\(...\)` / `\[...\]` to `$...$` / `$$...$$` in a selection, the current file, or optionally on paste, while excluding protected Markdown regions. |
| **YAML + UI config** | Edit `shortcuts.yaml` or use the settings tab; changes rebuild the shortcut trie immediately. |
| **Localized UI** | 11 mainstream locales bundled in `main.js` (incl. Simplified/Traditional Chinese). The other 61 [official Obsidian locales](https://github.com/obsidianmd/obsidian-translations#existing-languages) need `locales-extras.json` in the plugin folder (not installed automatically from the community directory). |
| **Non-destructive merge** | On load, missing default shortcuts are merged in; your custom key bindings are never overwritten. |

---

## Installation

### Community plugins (recommended)

In **Settings → Community plugins → Browse**, search for **Math Chords** and install.

Obsidian's installer downloads only **`main.js`**, **`manifest.json`**, and **`styles.css`** from the plugin's GitHub release — not any other release assets. That is enough for all plugin features. Settings UI text is available immediately for the **11 bundled locales** (English plus the languages listed under [Settings](#settings)); other Obsidian display languages fall back to English until you add `locales-extras.json` (see below).

### Manual install from a release

Download **`main.js`**, **`manifest.json`**, **`styles.css`**, and **`locales-extras.json`** from [Releases](https://github.com/ichenh/obsidian-math-chords/releases) into `.obsidian/plugins/math-chords/` inside your vault (create the folder if needed). Use the **`locales-extras.json`** from the **same release tag** as the installed plugin version. Copy **`shortcuts.yaml`** from the repo if you want the default shortcut catalog on disk.

### Optional: extra UI languages (`locales-extras.json`)

If your Obsidian display language is **not** one of the 11 bundled locales, install or update this file yourself:

1. Open [Releases](https://github.com/ichenh/obsidian-math-chords/releases) and download **`locales-extras.json`** from the release that matches your installed plugin version (check **Settings → Community plugins** or `manifest.json` in the plugin folder).
2. Place it at **`.obsidian/plugins/math-chords/locales-extras.json`** (same folder as `main.js`, not inside your notes).
3. Reload Obsidian or toggle the plugin off and on.

Without this file, the plugin still works; only the **Math Chords settings UI** stays in English. After adding the file, the settings UI follows your Obsidian language on the next load (for any of the 61 locales shipped in that JSON).

When you update the plugin from the community directory, repeat these steps if you rely on a non-bundled locale — updates replace `main.js` / `manifest.json` / `styles.css` but do not refresh `locales-extras.json`.

### From source

```bash
git clone https://github.com/ichenh/obsidian-math-chords.git
cd obsidian-math-chords
npm install
npm run build
```

Copy `main.js`, `manifest.json`, `styles.css`, `locales-extras.json`, and `shortcuts.yaml` into `.obsidian/plugins/math-chords/`.

---

## Quick start

1. Place the caret in a Markdown note.
2. Press the **leader key** (default `Alt+M`; configurable in settings) — optionally enable the which-key popup.
3. Press a shortcut, e.g. **`F`** → `\frac{}{}` with the cursor in the numerator.
4. For Greek letters: **`G` `A`** → `\alpha` (after the leader).
5. For display math: **`D`** → `$$\n\n$$`.
6. With only a caret inside math, pressing the matching inline/display command removes that wrapper. **Smart math toggle** (on by default) additionally lets the other command convert between inline and display math. A non-empty selection is always wrapped by the requested command.
7. Select LaTeX-delimited math and run **Convert LaTeX Delimiters in Selection**, or use the whole-file command. Assign either command under **Settings → Hotkeys** if desired.
8. Press **`Shift+E`** (default, after the leader) or run **Wrap display math with environment** to pick an environment. If the caret is not already inside `$$…$$`, a display block is inserted first.

> **Note:** Shortcut tables list keys **after** the leader. The default leader is `Alt+M`. Built-in commands do not register default hotkeys; assign them under **Settings → Hotkeys** if desired.

---

## Formula panel

Select the **sigma (Σ)** ribbon icon or run **Open formula panel** from Obsidian's command palette. The optional panel is enabled by default; disabling it removes the ribbon action, closes the open panel, and makes its command unavailable until re-enabled. The right sidebar groups the same shortcuts loaded from `shortcuts.yaml`; search matches keys, names, LaTeX commands, and groups. Click a rendered formula to insert it into the most recently active Markdown editor. The summary counts all panel **items**, including shortcut formulas and math environments. Groups start in a frequency-oriented order; use the grip button to the left of a group name to drag it into a personal order, the chevron on the right to collapse or expand one group, or the summary action to collapse or expand all groups at once. Group order and collapsed state persist across restarts.

Panel insertion uses the same selection replacement, `$$` caret marker, auto-wrap, display-math action, and cursor-placement rules as leader shortcuts. Reloading, merging, adding, editing, or deleting shortcuts refreshes open formula panels automatically. If no Markdown note is open, the plugin leaves the workspace unchanged and shows a notice.

The **Math environments** group reads the editable environment list from settings. Its built-in `aligned`, `matrix`, `cases`, and `gathered` entries use representative multi-row previews. Clicking one wraps the current display formula, or creates a new `$$…$$` block and environment in one undoable editor transaction when needed.

---

## Shortcut reference

### Structures & display math

| Keys | Inserts | Description |
| :--- | :--- | :--- |
| `F` | `\frac{}{}` | Fraction |
| `S` | `\sqrt{}` | Square root |
| `Shift+R` | `\sqrt[]{}` | Nth root |
| `^` | `^{}` | Superscript |
| `Shift+_` | `_{}` | Subscript |
| `D` | `$$…$$` | Display math block |

### Operators & symbols

| Keys | Inserts | Description |
| :--- | :--- | :--- |
| `U` | `\sum` | Sum |
| `I` | `\int` | Integral |
| `Shift+I` | `\int_{}^{}` | Integral with limits |
| `Y` | `\oint` | Contour integral |
| `P` | `\partial` | Partial derivative |
| `Shift+P` | `\prod_{}^{}` | Product |
| `L` | `\lim_{}` | Limit |
| `8` | `\infty` | Infinity |
| `'` | `'` | Prime |
| `+` | `\pm` | Plus-minus |
| `= \|` | `\neq` | Not equal |

### Accents

| Keys | Inserts | Description |
| :--- | :--- | :--- |
| `"` | `\ddot{}` | Double dot |
| `H` | `\hat{}` | Hat |
| `\` | `\grave{}` | Grave |
| `/` | `\acute{}` | Acute |
| `&` | `\tilde{}` | Tilde |
| `-` | `\bar{}` | Bar |
| `.` | `\dot{}` | Dot |
| `Shift+V` | `\breve{}` | Breve |
| `Shift+U` | `\check{}` | Check |
| `V` | `\vec{}` | Vector arrow |
| `_` | `\underline{}` | Underline |
| `B` | `\overline{}` | Overline |
| `A W` | `\widehat{}` | Wide hat |

### Delimiters

| Keys | Inserts | Description |
| :--- | :--- | :--- |
| `(` | `\left(\right)` | Parentheses |
| `[` | `\left[\right]` | Square brackets |
| `{` | `\left\{\right\}` | Curly brackets |
| `<` | `\left\langle\right\rangle` | Angle brackets |
| `>` | `\left)\right(` | Reverse parentheses |
| `\|` | `\left\|\right\|` | Vertical bars |
| `B N` | `\left\|\right\|` | Norm |
| `B F` | `\left\lfloor\right\rfloor` | Floor |
| `B E` | `\left\lceil\right\rceil` | Ceiling |

### Greek letters — lowercase (`G` + key)

| Keys | Inserts | Keys | Inserts |
| :--- | :--- | :--- | :--- |
| `G A` | `\alpha` | `G N` | `\nu` |
| `G B` | `\beta` | `G O` | `\omega` |
| `G C` | `\chi` | `G P` | `\pi` |
| `G D` | `\delta` | `G Q` | `\vartheta` |
| `G E` | `\epsilon` | `G R` | `\rho` |
| `G F` | `\phi` | `G S` | `\sigma` |
| `G G` | `\gamma` | `G T` | `\tau` |
| `G H` | `\eta` | `G U` | `\upsilon` |
| `G I` | `\iota` | `G V` | `\theta` |
| `G J` | `\varphi` | `G X` | `\xi` |
| `G K` | `\kappa` | `G Y` | `\psi` |
| `G L` | `\lambda` | `G Z` | `\zeta` |
| `G M` | `\mu` | | |

### Greek letters — uppercase & variants (`G Shift+` + key)

| Keys | Inserts | Keys | Inserts |
| :--- | :--- | :--- | :--- |
| `G Shift+D` | `\Delta` | `G Shift+S` | `\Sigma` |
| `G Shift+E` | `\varepsilon` | `G Shift+T` | `\varsigma` |
| `G Shift+F` | `\Phi` | `G Shift+U` | `\Upsilon` |
| `G Shift+G` | `\Gamma` | `G Shift+V` | `\Theta` |
| `G Shift+L` | `\Lambda` | `G Shift+O` | `\Omega` |
| `G Shift+P` | `\Pi` | `G Shift+X` | `\Xi` |
| | | `G Shift+Y` | `\Psi` |

### Extensions

**Arrows** (`W` prefix): `W R` `\rightarrow`, `W L` `\leftarrow`, `W Shift+R` `\Rightarrow`, `W Shift+L` `\Leftarrow`, `W M` `\mapsto`

**Operators** (`O` prefix): `O T` `\times`, `O C` `\cdot`, `O D` `\div`, `O E` `\equiv`, `O L` `\leq`, `O G` `\geq`, `O A` `\approx`, `O I` `\in`, `O U` `\cup`, `O Shift+U` `\cap`, `O Shift+N` `\nabla`

**Fonts** (`T` prefix): `T B` `\mathbf{}`, `T C` `\mathcal{}`, `T R` `\mathrm{}`, `T Shift+R` `\mathbb{}`, `T T` `\text{}`

**Matrices** (`M` prefix): `M P` pmatrix, `M B` bmatrix, `M C` cases. Their UI previews use compact 2-by-2 matrices or a two-row cases example; insertion still places the caret in an empty environment.

The full list lives in [`shortcuts.yaml`](shortcuts.yaml) (102 default shortcuts).

---

## Display-math environment wrap

With the caret inside `$$…$$`, or anywhere else in the note (a block is created first if needed):

1. Press the configured shortcut after the leader (default **`Shift+E`**), or run **Wrap display math with environment** from the command palette.
2. Choose an environment from the fuzzy-search list.
3. The plugin wraps the **entire block content** (not only the selection) and keeps delimiters and environment markers on separate lines.

   ```latex
   $$
   \begin{aligned}
   \alpha+\beta
   \end{aligned}
   $$
   ```

Creating a display block when needed and adding the environment are committed as one editor transaction, so one Undo reverts the command. Cancelling the picker does not modify the note.

Configure environments (name / `\begin{…}` / `\end{…}`) and the trigger keys under **Display-math environment wrap** in **Settings → Math Chords**, or assign a hotkey to the command in **Settings → Hotkeys**. On narrow settings panes, the environment table scrolls horizontally; compact order and name columns remain visible when space permits and are released on very narrow panes.

Default environments: `aligned`, `matrix`, `cases`, `gathered`.

---

## Configuration

### `shortcuts.yaml`

Shortcuts are a YAML array. The **leader key** is global (settings), not per entry.

```yaml
- keys: "F"
  command: "\\frac{$$}{}"
  name: "Fraction"
  group: "Structures"

- keys: "G A"
  command: "\\alpha"
  name: "alpha"
  group: "Greek"
```

| Field | Required | Description |
| :--- | :---: | :--- |
| `keys` | yes | Key sequence after the leader. Space-separated tokens; modifiers use `+` (`Shift+S`, `G A`). |
| `command` | yes | LaTeX snippet. Use `$$` once for the caret/selection position. Write `\frac` not `\\frac` in the settings UI (auto-normalized). |
| `name` | no | Label in the settings table and which-key popup. |
| `group` | no | Grouping label in the settings table. |

Special command `__DISPLAY_MATH__` inserts a `$$…$$` block (used by `D`).

### Key normalization

- Keys are canonicalized to lowercase `mod+base` order: `ctrl` → `alt` → `shift` → `meta`.
- Letters are lowercase unless `Shift` is explicit (`Shift+A`).
- A literal `+` is a valid base key. For punctuation produced with Shift on the
  current keyboard layout, an explicit `Shift+symbol` binding takes precedence;
  otherwise the printable-symbol binding is used.

## LaTeX delimiter conversion

Math Chords can replace standard LaTeX math delimiters while preserving the formula contents, whitespace, and line breaks:

- `\(...\)` → `$...$`
- `\[...\]` → `$$...$$`

Use **Convert LaTeX Delimiters in Selection** for selected text, or **Convert LaTeX Delimiters in Current File** for the active Markdown note. The whole-file command reports the number of display and inline formulas converted. Each command uses one editor transaction, so one Undo reverts the complete operation.

The converter leaves delimiters unchanged inside YAML frontmatter, fenced code blocks, inline code, HTML comments, HTML `<pre>` / `<code>` blocks, and existing `$...$` / `$$...$$` math. Existing Markdown math is recognized using delimiter rules that distinguish it from ordinary currency text. Multiple editor selections are processed in one transaction.

Enable **Automatically convert pasted LaTeX math delimiters** to apply the same context-aware conversion on paste. This setting is off by default. Paste conversion does not take over an event that another editor extension has already handled.

---

## Settings

Open **Settings → Math Chords**. The settings UI follows your Obsidian display language when a translation is available. On Obsidian 1.13.0 and later, individual Math Chords settings are also indexed by Obsidian's settings search.

**Bundled in `main.js`** (no extra file; works after community-plugin install): English, 简体中文, 繁體中文, 日本語, 한국어, Deutsch, Français, Español, Русский, Português (BR), Italiano.

**Other [official Obsidian locales](https://github.com/obsidianmd/obsidian-translations#existing-languages)** (e.g. Polski, Nederlands, ไทย, العربية, English (UK), Português) require **`locales-extras.json`** in the plugin folder. Obsidian does not download that file when installing from the community directory; see [Optional: extra UI languages](#optional-extra-ui-languages-locales-extrasjson).

| Setting | Default | Description |
| :--- | :--- | :--- |
| Enable plugin | on | Master switch for leader shortcuts. |
| Leader key | `Alt+M` | Global prefix before shortcut keys; `keys` in YAML are what follows it. |
| Show shortcut hints | on | Which-key panel after the leader. |
| Auto-wrap outside math | on | Auto-insert `$…$` around snippets when not in math. |
| Smart math toggle | on | Allow inline/display commands to convert an existing block to the other kind. Matching commands always remove their wrapper. |
| Inline math live preview | on | MathJax preview above `$…$`. |
| Enable formula panel | on | Show the sigma ribbon action and make the searchable sidebar command available. Disabling it removes the action, closes the panel, and disables the command. |
| Brace navigation in math | on | Jump between `{…}` inside math; defaults `Alt+→` / `Alt+←`. |
| Next / previous brace keys | `Alt+→` / `Alt+←` | Chords for brace navigation (when enabled). |
| Automatically convert pasted LaTeX math delimiters | off | Safely convert `\(...\)` / `\[...\]` in pasted text. |
| Enable environment wrap | on | Environment picker; creates and wraps `$$…$$` in one transaction when needed. |
| Environment wrap keys | `Shift+E` | Keys after the leader for the picker. |
| Math environments | 4 built-ins | Editable list for the picker. |

**Built-in commands** (assign or reassign under **Settings → Hotkeys**): **Open formula panel**, **Insert inline math**, **Insert display math**, **Wrap display math with environment**, **Convert LaTeX Delimiters in Selection**, **Convert LaTeX Delimiters in Current File**.

No built-in command registers a default hotkey. Assign any desired bindings under **Settings → Hotkeys**.

- `Insert inline math`: wrap a non-empty selection in `$…$`; with only a caret, insert inline math outside math, remove an existing inline wrapper, or convert display math when **Smart math toggle** is on.
- `Insert display math`: wrap a non-empty selection in `$$…$$`; with only a caret, insert display math outside math, remove an existing display wrapper, or convert inline math when **Smart math toggle** is on.

When cross-kind conversion is disabled, invoking the other math command inside an existing block leaves the note unchanged and shows a notice instead of creating invalid nested delimiters. Converting display math to inline math removes one wrapper-adjacent line break and replaces remaining internal line breaks with spaces, because inline Markdown math cannot span lines reliably.

**Shortcut management:** shortcuts are grouped into compact, container-responsive sections. Each row keeps the readable name and raw LaTeX command while adding a derived MathJax preview and keycap-style sequence; narrow panes move keys and actions onto dedicated rows instead of clipping them. Visible previews render on demand so opening settings does not eagerly typeset the entire catalog. Search matches keys, names, commands, and groups without rebuilding the settings page. Add and edit operations use aligned native dialogs; deletions require confirmation. **Reload** re-reads YAML, and **Merge defaults** appends missing built-in shortcuts without overwriting yours. Formula previews are presentation-only and are never written to `shortcuts.yaml`.

---

## Updating shortcuts

When the plugin loads (or you click **Reload** or **Merge defaults**):

1. Your existing YAML entries are kept **as-is** (same `keys` → same binding).
2. Any default shortcut whose key sequence is **not** yet present is **appended**.
3. The updated file is written back to `shortcuts.yaml`.

To reset completely, delete `shortcuts.yaml` and reload the plugin (a fresh default file will be seeded).

Regenerate the repo's default YAML from TypeScript:

```bash
npm run seed
```

---

## Project structure

```
math-chords/                  # Plugin id; install folder .obsidian/plugins/math-chords/
├── src/                    # TypeScript source
│   ├── main.ts             # Plugin entry
│   ├── leader.ts           # Leader shortcut state machine
│   ├── braceNav.ts         # Brace-pair navigation inside math
│   ├── delimiterConverter.ts # Pure, protected LaTeX delimiter conversion
│   ├── delimiterEditor.ts  # Obsidian editor transactions for conversion
│   ├── formulaPanel.ts      # Searchable Obsidian formula sidebar
│   ├── formulaPanelModel.ts # Pure panel grouping and filtering model
│   ├── markdownProtection.ts # Shared Markdown protected-region parser
│   ├── mathToggle.ts       # Pure inline/display toggle and conversion planning
│   ├── mathEnvPlan.ts      # Pure single-transaction environment planning
│   ├── defaults.ts         # Default shortcut catalog
│   ├── config.ts           # YAML load/save/merge
│   ├── shortcutPreviewRenderer.ts # Shared lazy MathJax preview rendering
│   ├── l10n/               # bundled locales + lazy extras loader
│   └── …                   # math, preview, settings UI, etc.
├── tests/
│   ├── unit/               # Vitest unit and regression tests
│   └── performance/        # Opt-in parser performance baselines
├── vitest.config.ts
├── shortcuts.yaml          # Shipped default shortcuts (102 entries)
├── styles.css              # Preview & settings styles
├── manifest.json           # Obsidian plugin manifest
├── scripts/                 # Generation, shared utilities, and validation
├── .github/                 # CI, release, Dependabot, and contribution templates
├── AGENTS.md                # Canonical Codex, engineering, and workflow rules
├── CONTRIBUTING.md          # Contributor workflow and submission requirements
├── SECURITY.md              # Private vulnerability reporting policy
├── CODE_OF_CONDUCT.md       # Community participation standards
├── eslint.config.mts        # Obsidian-aware lint configuration
├── .editorconfig            # Editor encoding and whitespace defaults
├── .gitattributes           # Repository line-ending and binary-file rules
└── esbuild.config.mjs       # Build config
```

---

## Development

Development requires Node.js `20.19+` or `22.12+`, as declared in `package.json`.

```bash
npm install
npm run dev    # watch build
npm run lint   # ESLint + Obsidian plugin rules
npm run build  # typecheck + production bundle
npm test       # Vitest unit tests
npm run bench  # opt-in parser and delimiter-conversion benchmarks
npm run seed   # rewrite shortcuts.yaml from src/defaults.ts
npm run check:shortcuts # verify shortcuts.yaml matches src/defaults.ts
npm run seed:locales  # bundled TS locales + locales-extras.json from scripts/locale-catalog.json
npm run check:locales # verify locale schema and generated artifacts
npm run check:release # verify metadata, changelog, and README version references
npm run check  # complete build, test, generated-artifact, and metadata verification
```

Canonical Codex guidance and module, safety, generation, and release rules:
[`AGENTS.md`](AGENTS.md). The repository does not define `.codex/config.toml`
because it currently needs no project-specific Codex runtime overrides.

Pull requests welcome. Follow [CONTRIBUTING.md](CONTRIBUTING.md), run `npm run check`
before submitting, and perform relevant manual Obsidian testing for editor-integrated
behavior.

Community participation follows the [Code of Conduct](CODE_OF_CONDUCT.md). Report
security vulnerabilities privately using the [Security Policy](SECURITY.md).

Potential future work and its design constraints are tracked in [ROADMAP.md](ROADMAP.md).

### Releasing

1. After the maintainer approves a release, update the version consistently in `package.json`, `package-lock.json`, and `manifest.json`; add its minimum-app mapping to `versions.json`.
2. Replace the `Unreleased` changelog section with a dated release section and create a new empty `Unreleased` section above it. Update the current-release line in both READMEs; the release badges track the latest GitHub release automatically.
3. Run `npm run check`, review the release assets, and complete the relevant manual Obsidian acceptance checks.
4. Commit, then tag with the exact version (no `v` prefix), e.g. `git tag 0.3.0 && git push origin 0.3.0`.
5. The [release workflow](.github/workflows/release.yml) reruns the complete verification path, builds and attaches `main.js`, `manifest.json`, `styles.css`, and `locales-extras.json`, and creates artifact attestations for every asset. Existing releases are not deleted or recreated.

---

## AI assistance

This repository has used **AI-assisted development tools**, including Cursor and
large language models, and is now maintained primarily with OpenAI Codex. These tools
support tasks such as drafting, refactoring, test design, documentation, and
consistency checks. Project decisions, accepted changes, and releases remain the
maintainer's responsibility.

- The use of AI does not replace code review, automated checks, or relevant manual
  testing in Obsidian.
- Contributors remain responsible for correctness, licensing, provenance, and the
  protection of private or confidential information.
- Scope, verification practices, and contribution requirements:
  [AI-ASSISTANCE.md](AI-ASSISTANCE.md).

---

## License

[MIT](LICENSE) © [CHEH Hua](https://github.com/ichenh)
