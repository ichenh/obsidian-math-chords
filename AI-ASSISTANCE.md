# AI Assistance Disclosure

[中文说明](AI-ASSISTANCE.zh-CN.md)

This repository has used AI-assisted development tools, including Cursor and large
language models, and is currently maintained primarily with OpenAI Codex. These tools
are used as implementation and review aids; they do not make project decisions or
replace maintainer review.

## Scope of assistance

AI tools may be used to:

- draft or refactor TypeScript, tests, build scripts, and documentation;
- identify edge cases and propose test cases;
- compare related code paths and check consistency across generated files; and
- help investigate build, test, localization, and release-metadata failures.

AI-generated suggestions are not accepted solely because they compile, pass a test,
or were produced by a particular tool. Feature scope, architecture, compatibility,
release timing, and the final contents of the repository remain human decisions.

## Responsibility and verification

The maintainer, [CHEN Hua](https://github.com/ichenh), is responsible for changes
accepted into the project. Changes are reviewed in context and verified in
proportion to their risk. The repository's standard checks include:

- `npm run build` for TypeScript checking and production bundling;
- `npm test` for automated behavior tests;
- `npm run check:shortcuts` for generated shortcut-catalog consistency;
- `npm run check:locales` for generated localization completeness;
- `npm run check:release` for package and release-metadata consistency; and
- manual testing in Obsidian when behavior depends on the editor, commands,
  settings, hotkeys, paste handling, or undo history.

`npm run check` runs the complete automated verification sequence used by CI.

These checks reduce risk but do not guarantee that the software is free of defects.
Users should report reproducible problems through the project's issue tracker.

## Requirements for contributors

Contributors who use AI-assisted tools must:

1. understand and review every submitted change;
2. test the affected behavior and include or update tests when practical;
3. disclose material AI assistance in the pull-request description;
4. verify that submitted material is compatible with the project's license and
   does not reproduce third-party code or text without permission; and
5. never provide secrets, private vault contents, personal data, or other
   confidential information to an AI service.

The contributor remains the author and accountable submitter of the pull request.
AI output without adequate review, provenance, or validation may be rejected.

## License and transparency

This disclosure documents the development process. It does not change the
[MIT license](LICENSE), the plugin's behavior, or users' rights to use, inspect,
modify, and redistribute the software under that license.

Repository architecture, generated-file rules, and required verification commands
are documented in [AGENTS.md](AGENTS.md).
