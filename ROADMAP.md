# Roadmap

[简体中文](ROADMAP.zh-CN.md)

This document records future work and its design constraints. Equation numbering and
references are the accepted next product milestone; other items remain unscheduled
until they are accepted for implementation.

## Next milestone: equation numbering and references

### Goal

Add reliable equation numbers and cross-references without rewriting formula contents
or making a note depend on hidden global state.

### Preferred design

- Treat explicit labels in Markdown as the durable source of identity; numbering is a
  derived presentation layer and remains stable for the current document order.
- Support numbered display math, optional custom tags, and references that can be
  inserted from a searchable picker.
- Keep indexing document-scoped first. Cross-note references require an explicit note
  target and must degrade to readable Markdown when the plugin is unavailable.
- Resolve duplicate, missing, renamed, and deleted labels visibly. Never guess between
  ambiguous targets or silently rewrite unrelated notes.
- Recompute only affected ranges after an edit and share one index between Live Preview,
  Reading view, autocomplete, and export.
- Apply every insertion, rename, or reference update through one editor transaction so
  one Undo restores the previous state.

### Acceptance criteria

- Numbered equations and references agree in Source mode, Live Preview, Reading view,
  PDF/HTML export, and after an Obsidian restart.
- Inserting or renaming a label updates the current note without moving the caret,
  altering formula contents, or producing nested math delimiters.
- Duplicate and unresolved labels have accessible, actionable diagnostics.
- Large notes update incrementally rather than rescanning and rerendering every formula
  on each keystroke.
- Existing notes remain unchanged until the author explicitly opts into numbering or
  inserts a reference.

### Non-goals for this milestone

- No automatic vault-wide renumbering.
- No dependency on undocumented MathJax internals or another Obsidian plugin.
- No citation-manager semantics; equation references remain a focused Markdown feature.

## Document-scoped LaTeX macros

### Goal

Allow concise commands such as `\dd` while keeping each note reproducible and avoiding
uncontrolled mutation of Obsidian's shared MathJax state.

This is distinct from shortcut expansion. A shortcut inserts a complete expression at
one location; a document-scoped macro gives repeated notation one visible definition,
so changing that definition can update its meaning consistently throughout the note.

Example definition:

```latex
\newcommand{\dd}{\mathop{}\!\mathrm{d}}
```

### Preferred design

- Store macros as structured entries: command name, argument count, optional default,
  and replacement text.
- Provide an explicit command to insert or update a macro preamble in the current note,
  after YAML frontmatter when present.
- Keep definitions document-scoped and visible in Markdown so reopening, exporting, and
  synchronization do not depend on transient plugin state.
- Render shortcut and inline previews with locally scoped definitions so opening the
  settings page cannot register or redefine macros globally.
- Validate command names, argument references, duplicate definitions, recursive
  expansion, and conflicts between `\newcommand` and `\renewcommand`.
- Apply each preamble insertion or update as one editor transaction with one-step Undo.
- Explain that compatibility outside Obsidian depends on the target Markdown renderer's
  MathJax configuration.

### Non-goals

- Do not mutate undocumented MathJax internals.
- Do not silently install vault-wide macros or allow one note to redefine rendering in
  unrelated notes.
- Do not require another Obsidian plugin.

### Acceptance criteria

- Zero-argument and parameterized macros render consistently in Live Preview and Reading
  view after opening, editing, switching notes, and restarting Obsidian.
- Macro definitions remain stable when YAML frontmatter is present.
- Invalid or conflicting definitions produce actionable validation messages and do not
  partially modify the note.
- Shortcut previews never leak macro definitions into Obsidian's shared MathJax state.
- Desktop and mobile behavior is verified against the plugin's declared minimum Obsidian
  version.

For users who only need faster input, inserting the fully expanded LaTeX expression as a
normal Math Chords shortcut remains the simpler portable solution. Document-scoped
macros remain valuable when notation is repeated, parameterized, or expected to change
consistently across a note.

## Later candidates

- Named export presets for TikZ raster scale, background, and file naming.
- A maintained TikZ visual-regression corpus covering representative built-in and local
  TeX output across light/dark themes and CJK scripts.
