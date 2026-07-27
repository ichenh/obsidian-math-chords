# Architecture

[简体中文](ARCHITECTURE.zh-CN.md)

This document describes Math Chords 0.5.x runtime and trust boundaries.
User-facing behavior is documented in the README; implementation rules remain in
`AGENTS.md`.

## Principles

- Notes remain ordinary Markdown, LaTeX, and fenced TikZ source.
- Editor changes use Obsidian transactions and remain undoable.
- Parsing and transformation logic stay independent of Obsidian APIs where practical.
- Expensive work is lazy, bounded, cancellable, and kept away from the editing thread.
- Unsupported TikZ fails closed or uses an explicit compatibility backend instead of
  producing a plausible but incorrect diagram.

## Runtime layers

```text
Obsidian lifecycle and settings
├── Math authoring
│   ├── leader state machine and shortcut trie
│   ├── formula and template panel
│   ├── math toggle, brace navigation, and environment planner
│   └── protected delimiter conversion
└── Optional TikZ rendering
    ├── fence processor and editor preview
    ├── render coordinator and bounded caches
    ├── original Rust/WASM vector renderer
    ├── optional local TeX compatibility backend
    └── sanitized display, MathJax labels, and export
```

`src/main.ts` owns registration and orchestration. Pure operations live in focused
modules; UI and editor adapters call them without moving parsing rules into the entry
point.

## TikZ backends

The default renderer lives in `crates/chord-tikz-core`. It has no Cargo dependencies
and compiles to a small WASM module. The module and original Worker source are
compressed into `main.js`, so the normal three-file Obsidian installation is complete
and requires no runtime download.

One reusable Worker owns initialization and rendering. Requests have source, time,
memory, expansion, loop, sample, and output bounds. Cancellation or timeout terminates
the Worker before later work continues. Math labels are emitted as anchors and
rendered with Obsidian MathJax.

Automatic mode keeps supported diagrams on that same WASM instance and cache. The
capability analyzer routes syntax that cannot yet be reproduced faithfully to local
TeX when available. Backend selection changes only the derived artifact, never the
note.

Local TeX is desktop-only and optional. Detection covers common distributions,
`PATH`, and a user override. Processes use argument arrays rather than a shell, disable
shell escape, hide console windows, use a verified temporary directory, and enforce
timeouts and size limits. TeX remains a complex interpreter, so this backend is for
trusted source and formal compatibility work.

## Preview, safety, and caching

Reading view schedules only diagrams near the viewport. Editor preview is a fixed
overlay outside CodeMirror layout. New frames are prepared off-screen and swapped
atomically, leaving the previous successful frame visible during edits.

SVG uses element and attribute allowlists. Scripts, event handlers, external links,
external paint URLs, unsafe raw specials, and non-local marker, mask, or clip
references are rejected. Desktop export uses the system save dialog for SVG, PNG,
JPEG, and PDF.

The latest-request-wins coordinator aborts stale work. Memory and IndexedDB caches are
bounded by count and bytes. Persistent-cache metadata is separate from artifact
bodies, so pruning does not load every cached image. Cache keys cover renderer
version, WASM fingerprint, backend, theme, fonts, and source.

## Localization

English lives in `src/l10n/locales/en.ts`; `scripts/locale-catalog.json` is the source
for the other 71 bundles. Generation validates key coverage and compresses every
bundle into `main.js`; only the active locale is expanded at startup.

Simplified and Traditional Chinese, French, German, Spanish, Italian, Brazilian
Portuguese, Russian, Japanese, and Korean are maintained as primary translations.
Other declared Obsidian locales ship offline and use current English fallback text
where no reviewed translation exists, preventing stale UI copy without a second
download.

## Build and external boundaries

`src/defaults.ts`, the English locale, the locale catalog, and the Rust crate are
source inputs. Generated locale modules, `shortcuts.yaml`, embedded WASM, and
`main.js` are regenerated and checked rather than edited manually. Production bundles
are minified; release CI runs the full gate and publishes only `main.js`,
`manifest.json`, and `styles.css`.

Math Chords does not bundle another TikZ plugin, a browser-TeX snapshot, a separate
MathJax distribution, or a PDF renderer. MathJax, PDF, editor, and CodeMirror APIs are
provided by Obsidian; local TeX is an explicit optional system dependency. The Rust
renderer and its orchestration, sanitization, caching, preview, and export layers are
maintained in this repository.
