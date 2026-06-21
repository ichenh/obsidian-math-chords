# Math Chords for Obsidian

[中文文档](README.zh-CN.md)

[![Version](https://img.shields.io/badge/version-0.2.0-blue)](manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![CI](https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml/badge.svg)](https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml)

**Math Chords** adds **keyboard shortcuts for LaTeX math** in Obsidian: press a leader key (default `Alt+M`), then a short sequence to insert fractions, Greek letters, integrals, and other snippets—without typing `\frac`, `\alpha`, and the rest by hand. Also includes **live inline formula preview** and **display-math environment wrapping**.

Default shortcuts are inspired by [LyX](https://www.lyx.org/) math-mode bindings.

**Current release: v0.2.0.** See [CHANGELOG](CHANGELOG.md).

**Requires Obsidian 1.5.0+.** Keyboard-heavy; desktop recommended.

> **Community plugin browser:** Obsidian shows each plugin's `description` from `manifest.json` in **English only** (the browse UI itself follows your app language). After install, **Settings → Math Chords** and command names follow your Obsidian display language.

![Math Chords demo: leader shortcuts insert LaTeX with live preview](docs/demo.gif)

---

## Table of contents

- [Features](#features)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Shortcut reference](#shortcut-reference)
- [Display-math environment wrap](#display-math-environment-wrap)
- [Configuration](#configuration)
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
| **Shortcuts** | Press a configurable leader key, then a key sequence to insert LaTeX snippets. |
| **Caret placeholder** | `$$` in a command template marks where the cursor (or selection) is placed, e.g. `\frac{$$}{}`. |
| **Auto `$…$` wrap** | Optional: when inserting outside math, wrap the snippet in inline math delimiters. |
| **Inline live preview** | While the caret is inside `$…$`, a floating panel above the formula renders with Obsidian's native **MathJax**. |
| **Display-math environments** | Wrap block content with `\begin{…}…\end{…}` via a fuzzy-search picker; inserts `$$…$$` when needed. |
| **Built-in math commands** | Insert inline/display math; optional smart toggle unwraps or converts inside existing blocks (see settings). |
| **YAML + UI config** | Edit `shortcuts.yaml` or use the settings tab; changes rebuild the shortcut trie immediately. |
| **Localized UI** | 11 mainstream locales bundled in `main.js` (incl. Simplified/Traditional Chinese); 61 others load from `locales-extras.json` on first use. |
| **Non-destructive merge** | On load, missing default shortcuts are merged in; your custom key bindings are never overwritten. |

---

## Installation

### Manual

Prefer **Settings → Community plugins → Browse** and search for **Math Chords**.

To install from a release manually, download **`main.js`**, **`manifest.json`**, **`styles.css`**, and **`locales-extras.json`** from [Releases](https://github.com/ichenh/obsidian-math-chords/releases) into `.obsidian/plugins/math-chords/` (create the folder if needed). Copy **`shortcuts.yaml`** from the repo if you want the default shortcut catalog on disk.

When installed from the community directory, Obsidian downloads `main.js`, `manifest.json`, `styles.css`, and `locales-extras.json` from the GitHub release automatically.

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
6. Smart toggle (on by default): inside a math block, inline/display commands unwrap or convert instead of inserting again; turn off under **Smart math toggle** in settings.
7. Press **`Shift+E`** (default, after the leader) or run **Wrap display math with environment** to pick an environment. If the caret is not already inside `$$…$$`, a display block is inserted first.

> **Note:** Shortcut tables list keys **after** the leader. The default leader is `Alt+M`. Assign hotkeys for the built-in commands under **Settings → Hotkeys** (no defaults are registered).

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

**Matrices** (`M` prefix): `M P` pmatrix, `M B` bmatrix, `M C` cases

The full list lives in [`shortcuts.yaml`](shortcuts.yaml) (101 default shortcuts).

---

## Display-math environment wrap

With the caret inside `$$…$$`, or anywhere else in the note (a block is created first if needed):

1. Press the configured shortcut after the leader (default **`Shift+E`**), or run **Wrap display math with environment** from the command palette.
2. Choose an environment from the fuzzy-search list.
3. The plugin wraps the **entire block content** (not only the selection), e.g.  
   `$$\alpha+\beta$$` → `$$\begin{aligned}\alpha+\beta\end{aligned}$$`

Configure environments (name / `\begin{…}` / `\end{…}`) and the trigger keys under **Display-math environment wrap** in **Settings → Math Chords**, or assign a hotkey to the command in **Settings → Hotkeys**.

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

---

## Settings

Open **Settings → Math Chords**. The settings UI follows your Obsidian display language. **Bundled** (no extra load): English, 简体中文, 繁體中文, 日本語, 한국어, Deutsch, Français, Español, Русский, Português (BR), Italiano. **Other [official locales](https://github.com/obsidianmd/obsidian-translations#existing-languages)** load from `locales-extras.json` the first time they are needed.

| Setting | Default | Description |
| :--- | :--- | :--- |
| Enable plugin | on | Master switch for leader shortcuts. |
| Show shortcut hints | off | Which-key panel after the leader. |
| Inline math live preview | on | MathJax preview above `$…$`. |
| Leader key | `Alt+M` | Global prefix before shortcut keys; `keys` in YAML are what follows it. |
| Auto-wrap outside math | on | Auto-insert `$…$` around snippets when not in math. |
| Smart math toggle | on | Inside a math block, inline/display commands unwrap or convert instead of inserting a new block. |
| Enable environment wrap | on | Environment picker; inserts `$$…$$` first when needed. |
| Environment wrap keys | `Shift+E` | Keys after the leader for the picker. |
| Math environments | 4 built-ins | Editable list for the picker. |

**Built-in commands** (assign under **Settings → Hotkeys**): **Insert inline math**, **Insert display math**, **Wrap display math with environment**.

- `Insert inline math`: insert `$…$` outside math; when **Smart math toggle** is on, inside inline math unwraps and inside display math converts to inline.
- `Insert display math`: insert `$$…$$` outside math; when **Smart math toggle** is on, inside display math unwraps and inside inline math converts to display.

**Shortcut management:** search, add, edit, delete entries; **Reload** re-reads YAML; **Merge defaults** appends any missing built-in shortcuts without overwriting yours.

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
│   ├── defaults.ts         # Default shortcut catalog
│   ├── config.ts           # YAML load/save/merge
│   ├── l10n/               # bundled locales + lazy extras loader
│   └── …                   # math, preview, settings UI, etc.
├── shortcuts.yaml          # Shipped default shortcuts (101 entries)
├── styles.css              # Preview & settings styles
├── manifest.json           # Obsidian plugin manifest
├── esbuild.config.mjs      # Build config
└── scripts/seed-yaml.cjs   # Regenerate YAML from defaults.ts
```

---

## Development

```bash
npm install
npm run dev    # watch build
npm run build  # typecheck + production bundle
npm run seed   # rewrite shortcuts.yaml from src/defaults.ts
npm run seed:locales  # bundled TS locales + locales-extras.json from scripts/locale-catalog.json
```

Module layout and constraints: [`.cursorrules`](.cursorrules).

Pull requests welcome. Run `npm run build` before submitting.

### Releasing

1. Bump `version` in `manifest.json` and `package.json`; add the mapping to `versions.json`.
2. Update `CHANGELOG.md`.
3. Commit, then tag with the exact version (no `v` prefix), e.g. `git tag 0.1.6 && git push origin 0.1.6`.
4. The [release workflow](.github/workflows/release.yml) builds and attaches `main.js`, `manifest.json`, `styles.css`, and `locales-extras.json`, with artifact attestations for `main.js` and `styles.css`.

---

## AI assistance

This repository was bootstrapped and maintained with **AI-assisted coding tools**
(Cursor IDE and large language models) under human review.

- Full disclosure: [AI-ASSISTANCE.md](AI-ASSISTANCE.md)
- Contributors using AI should review all output and mention it in PR descriptions.

---

## License

[MIT](LICENSE) © [CHEH Hua](https://github.com/ichenh)
