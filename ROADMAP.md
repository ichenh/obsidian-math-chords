# Roadmap

[简体中文](ROADMAP.zh-CN.md)

This document records possible future work and its design constraints. Items here are
not release commitments and have no scheduled version until they are accepted for
implementation.

## Document-scoped LaTeX macros

### Goal

Allow concise commands such as `\dd` while keeping each note reproducible and avoiding
uncontrolled mutation of Obsidian's shared MathJax state.

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
normal Math Chords shortcut remains the preferred portable solution.
