# 参与 Math Chords 开发

[English](CONTRIBUTING.md)

提交内容应保持插件现有行为、Obsidian 兼容性和非破坏性编辑保证。修改架构、解析器、生成文件、CI 或发布元数据前，请先阅读 [AGENTS.md](AGENTS.md)。

参与项目须遵守[行为准则](CODE_OF_CONDUCT.zh-CN.md)。安全漏洞请按照[安全策略](SECURITY.zh-CN.md)私下报告，不要提交公开 Issue。

## 开发环境

请使用 `package.json` 支持的 Node.js 版本。

```bash
npm install
npm run check
```

完整检查包括 ESLint、严格 TypeScript、生产构建、Vitest、生成文件漂移检查和发布元数据校验。

需要从锁文件进行干净、可复现的安装时使用 `npm ci`；CI 和发布任务也使用该命令。不要提交 `main.js`、`data.json`、临时脚本产物或依赖目录。

## 修改要求

- 保持修改范围集中，不覆盖仓库中的无关改动。
- 行为变更和回归修复应在 `tests/unit/` 下补充或更新聚焦测试。
- 修改默认快捷键时，编辑 `src/defaults.ts` 后运行 `npm run seed`。
- 修改界面文本时，编辑 `src/l10n/locales/en.ts` 和 `scripts/locale-catalog.json` 后运行 `npm run seed:locales`。
- 面向用户的行为应在 `README.md` 与 `README.zh-CN.md` 中保持一致。
- 重要修改记录在 `CHANGELOG.md` 的 `Unreleased` 下。
- 未经维护者明确确认发布，不要修改版本字段。

定界符转换及其他包含多处编辑的命令必须保持单步撤销，并且不得修改受保护的 Markdown 区域。完整安全约束见 [AGENTS.md](AGENTS.md)。

## 验证

提交前运行完整自动化检查：

```bash
npm run check
```

若修改涉及命令、设置、快捷键、编辑器焦点、粘贴处理、弹出窗口、渲染或撤销历史，还应在 Obsidian 中测试，并在 Pull Request 中说明相关手动验证。

## Pull Request

说明问题、选定行为、受影响文件和已经完成的验证，并明确兼容性或迁移影响。生成文件应与其来源修改一并提交。

若 AI 辅助工具对修改产生实质影响，应披露其使用情况并遵守 [AI 辅助开发说明](AI-ASSISTANCE.zh-CN.md)。贡献者仍对正确性、许可证兼容性、内容来源和机密信息负责。
