<h1 align="center">Math Chords for Obsidian</h1>

<p align="center">
  <strong>面向 Obsidian 的实用数学写作工具箱。</strong><br />
  更快输入 LaTeX，安全整理外部公式，并随时快捷插入常用数学或 Markdown 模板。
</p>

<p align="center">
  <a href="README.md">English</a> · <b>简体中文</b>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT 许可证" /></a>
  <img src="https://img.shields.io/badge/Obsidian-1.5.0%2B-7C3AED?logo=obsidian&logoColor=white" alt="Obsidian 1.5.0 或更高版本" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <a href="https://github.com/ichenh/obsidian-math-chords/releases/latest"><img src="https://img.shields.io/github/v/release/ichenh/obsidian-math-chords?display_name=tag&sort=semver" alt="最新版本" /></a>
  <a href="https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml"><img src="https://github.com/ichenh/obsidian-math-chords/actions/workflows/ci.yml/badge.svg" alt="CI 状态" /></a>
  <a href="https://github.com/ichenh/obsidian-math-chords/actions/workflows/release.yml"><img src="https://github.com/ichenh/obsidian-math-chords/actions/workflows/release.yml/badge.svg" alt="发布状态" /></a>
</p>

**Math Chords** 是一套围绕数学 Markdown 写作构建的 Obsidian 工具。名称来自类似“和弦”的 leader 连续按键，但现在的功能已经覆盖从输入公式到复用整段笔记内容的完整流程：

- 用简短、容易记忆的按键序列输入常用 LaTeX 结构；
- 从可搜索侧边栏浏览并插入公式；
- 把常用方程保存为带标题的模板，通过点击或拖入快速复用；
- 在同一模板树中保存任意 Markdown，例如定义、推导、callout、表格或完整文档段落；
- 安全转换从 AI 工具、论文或 TeX 文档复制而来的公式定界符；
- 预览行内公式、在大括号参数位之间跳转、切换公式包裹并添加行间环境。

数学公式仍是模板功能的核心使用场景，但模板并不限制内容类型。模板以原始 Markdown 保存在插件设置中，插入时写入当前笔记，因此既可以存放麦克斯韦方程组，也可以存放证明框架、实验报告章节或其他反复使用的 Markdown 内容。它是一套快捷插入库，不会在库中创建模板文件，也不替代 Obsidian 核心的文件型“模板”功能。

内置默认快捷键参考了 [LyX](https://www.lyx.org/) 数学模式的绑定。

**当前版本：v0.5.1。** 见 [CHANGELOG](CHANGELOG.md)。

**需要 Obsidian 1.5.0+。** 以键盘操作为主，建议在桌面端使用。

![Math Chords 演示：leader 快捷键插入 LaTeX 并实时预览](docs/demo.gif)

---

## 目录

- [Math Chords 能做什么](#math-chords-能做什么)
- [安装](#安装)
- [快速开始](#快速开始)
- [公式面板](#公式面板)
- [快捷键参考](#快捷键参考)
- [行间公式环境包裹](#行间公式环境包裹)
- [配置](#配置)
- [LaTeX 定界符转换](#latex-定界符转换)
- [TikZ 渲染](#tikz-渲染)
- [设置](#设置)
- [更新快捷键](#更新快捷键)
- [项目结构](#项目结构)
- [架构](ARCHITECTURE.zh-CN.md)
- [开发](#开发)
- [AI 辅助说明](#ai-辅助说明)
- [许可证](#许可证)

---

## Math Chords 能做什么

Math Chords 面向公式密集的 Markdown 笔记：加快结构化 LaTeX 输入，复用经常出现的
源码，规范化外部公式，并可选渲染 TikZ；笔记始终保持为普通 Markdown/LaTeX 文本，
不会变成插件专属格式。日常工作以轻快的内置路径为主，需要更广兼容性时再使用
Obsidian MathJax 或可选的本机 TeX。

| 功能 | 说明 |
| :--- | :--- |
| **结构化输入** | 按可配置的 leader 键，再按按键序列插入常用 LaTeX 结构和符号。 |
| **公式与模板面板** | 浏览快捷键，或用无限层级树整理可复用的数学与 Markdown 模板，再通过点击或拖动插入笔记。 |
| **光标占位符** | 命令模板中的 `$$` 标记光标（或选区）位置，例如 `\frac{$$}{}`。 |
| **自动 `$…$` 包裹** | 可选：在公式区域外插入时，自动用行内公式定界符包裹。 |
| **行内实时预览** | 光标位于 `$…$` 内时，在公式上方用 Obsidian 原生 **MathJax** 渲染预览（默认开启）。 |
| **公式内大括号跳转** | 在 `$…$` / `$$…$$` 内用可配置按键在 `{…}` 参数位之间跳转（默认 `Alt+→` / `Alt+←`；默认开启）。 |
| **行间公式环境** | 通过模糊搜索选择 `\begin{…}…\end{…}` 包裹块内容；必要时先插入 `$$…$$`。 |
| **内置数学命令** | 包裹选中文本、插入行内/行间公式，或移除同类型包裹；可选的智能切换允许在行内和行间公式之间转换。 |
| **LaTeX 定界符转换** | 将选区、当前文件或粘贴文本中的 `\(...\)` / `\[...\]` 转为 `$...$` / `$$...$$`，同时排除受保护的 Markdown 区域。 |
| **可选 TikZ 渲染** | 使用自包含 WASM 渲染 TikZ 围栏代码块，在独立窗口中实时预览，并导出 SVG、PNG、JPEG 或 PDF；本机 TeX 作为高级兼容选项保留。 |
| **YAML + 设置界面** | 编辑 `shortcuts.yaml` 或使用设置页；修改后立即重建快捷键查找树。 |
| **界面本地化** | 全部 72 个语言包均内置于 `main.js`。十种主要语言持续完整维护，其余 [Obsidian 官方语言](https://github.com/obsidianmd/obsidian-translations#existing-languages) 在暂无审校翻译时使用当前英语回退文本，无需额外下载语言包。 |
| **非破坏性合并** | 加载时合并缺失的默认快捷键，不会覆盖你的自定义绑定。 |

---

## 安装

### 社区插件（推荐）

在 **设置 → 社区插件 → 浏览** 中搜索 **Math Chords** 并安装。

Obsidian 安装器会下载 **`main.js`**、**`manifest.json`**、**`styles.css`**。这三个文件已经包含全部插件功能和 72 个语言包，不需要第二次下载。

### 从 Release 手动安装

从 [Releases](https://github.com/ichenh/obsidian-math-chords/releases) 下载 **`main.js`**、**`manifest.json`**、**`styles.css`** 到库内的 `.obsidian/plugins/math-chords/`（若无此目录请先创建）。如需默认快捷键文件，可另外从仓库复制 **`shortcuts.yaml`**。

### 从源码构建

```bash
git clone https://github.com/ichenh/obsidian-math-chords.git
cd obsidian-math-chords
npm install
npm run build
```

将 `main.js`、`manifest.json`、`styles.css`，以及可选的 `shortcuts.yaml` 复制到 `.obsidian/plugins/math-chords/`。

---

## 快速开始

根据当前任务选择对应流程即可。

### 输入公式

1. 在 Markdown 笔记中定位光标，按下 **leader 键**（默认 `Alt+M`）。
2. 继续输入序列：**`F`** 插入 `\frac{}{}`，**`G` `A`** 插入 `\alpha`，**`D`** 插入行间公式块。
3. 快捷片段中的 `$$` 标记选区或光标落点；如果记不住序列，可开启 leader 后的快捷键提示。

### 复用公式或 Markdown 内容块

1. 点击 sigma（Σ）Ribbon 图标，或运行 **Open formula panel** 打开公式面板。
2. 在**模板**板块点击“新建模板”图标直接创建根模板，或用“新建文件夹”整理嵌套目录。
3. 输入模板标题和 Markdown 正文，例如麦克斯韦方程组、定理框架或一整段重复使用的笔记结构。
4. 点击渲染后的模板插入当前选区，或从左侧手柄把模板拖入编辑器。

### 整理外部 LaTeX

1. 选中含有 `\(...\)` 或 `\[...\]` 的文本，运行 **Convert LaTeX Delimiters in Selection**；整篇笔记可使用当前文件转换命令。
2. 也可选择粘贴时自动转换。转换器只改变定界符，并跳过 frontmatter、代码、HTML 注释、HTML 代码块和已有 Markdown 公式。

若需行间环境，可在 leader 后按 **`Shift+E`**，或运行 **Wrap display math with environment**。仅有光标且位于公式内时，同类型公式命令会移除包裹；开启 **Smart math toggle** 后，另一种命令可在行内与行间公式之间转换。非空选区始终由所调用的命令包裹。

> **说明：** 下文快捷键表只列出 **leader 之后** 的按键。默认 leader 为 `Alt+M`。

---

## 公式面板

点击 **sigma（Σ）** Ribbon 图标，或运行 **Open formula panel**。这个右侧面板默认启用；关闭后会移除 Ribbon 入口、关闭面板并停用命令，重新启用即可恢复。

### 快捷键与数学环境

**快捷键**板块与 leader 输入共用同一份目录。搜索可匹配按键、名称、LaTeX 命令、分组、文件夹名称、模板标题和模板内容。点击渲染后的快捷公式会插入编辑器当前选区；也可拖动公式卡片，在鼠标指向的 Markdown 编辑器准确位置插入。拖放由 Math Chords 直接处理，因此仍会应用快捷片段展开、公式外自动包裹和光标定位规则。**数学环境**分组读取设置中的可编辑列表；内置 `aligned`、`matrix`、`cases` 和 `gathered` 提供代表性预览，同样可以点击或拖入编辑器，并以一次可撤销事务完成插入或包裹。

### 可复用 Markdown 模板

**模板**板块是一套以数学笔记为重点、但内容类型不限的复用库：

- 板块右侧的“新建文件夹”和“新建模板”图标可直接在根目录创建内容；每个文件夹也提供这两个图标，嵌套层级没有固定上限。
- 新文件夹保持为空，需要模板时再点击清晰区分的“新建模板”图标。
- 每个模板分别保存标题和 Markdown 正文。正文中的行间公式、标题、列表、链接、表格、callout 及其他 Obsidian 支持的 Markdown 会直接显示为预览；模板和文件夹标题栏均提供需要确认的删除操作。
- 点击模板标题或预览可把原始 Markdown 插入当前选区；拖动标题或预览区可按编辑器中显示的落点光标插入正文，左侧手柄则专门用于重组模板树。
- 点击星标可收藏重要模板。完整模板树上方会显示紧凑的“收藏”和“最近使用”快捷区；最近使用最多保留 12 项，点击或拖入笔记都会更新顺序。
- 拖动任意文件夹或模板，可放到同级项目之前或之后、移入其他文件夹，或移回根目录。空文件夹会保持为空；移动或删除最后一个模板后不会自动生成占位模板。

模板既可以只保存一组麦克斯韦方程，也可以保存一整段可重复使用的 Markdown 文档结构。内容存储在 Math Chords 的插件设置中，而不是作为库内文件存在。

### 面板与设置页的整理方式

拖动左侧手柄可调整快捷键分组、两个主板块、模板文件夹和模板块的顺序。右侧箭头用于独立收起节点；统计栏按钮可一起收起或展开全部快捷键分组、模板文件夹和模板块。顺序与收起状态会跨重启保存。

**设置 → Math Chords → 模板管理**呈现同一棵模板树，支持搜索、根目录或任意文件夹创建、标题与正文编辑、文件夹重命名、删除，以及和数学面板相同的自由拖放：放到项目之前、之后或文件夹内部。聚焦拖动手柄后也可用方向键调整同级顺序。快捷键管理、模板管理及其内部各组都可收起，避免设置页过长。

面板插入与 leader 快捷键共用选区替换、`$$` 光标标记、公式外自动包裹、行间公式动作及光标定位规则。重新加载、合并、新增、编辑或删除快捷键后，已打开的公式面板会自动刷新。若当前没有可用的 Markdown 笔记，插件不会修改工作区，并会显示提示。

---

## 快捷键参考

### 结构

| 按键 | 插入 | 说明 |
| :--- | :--- | :--- |
| `F` | `\frac{}{}` | 分数 |
| `S` | `\sqrt{}` | 平方根 |
| `Shift+R` | `\sqrt[]{}` | n 次根 |
| `^` | `^{}` | 上标 |
| `Shift+_` | `_{}` | 下标 |

### 运算符与符号

| 按键 | 插入 | 说明 |
| :--- | :--- | :--- |
| `U` | `\sum` | 求和 |
| `I` | `\int` | 积分 |
| `Shift+I` | `\int_{}^{}` | 带上下限积分 |
| `Y` | `\oint` | 环路积分 |
| `P` | `\partial` | 偏导 |
| `D` | `\mathrm{d}` | 微分符号 |
| `Shift+P` | `\prod_{}^{}` | 连乘 |
| `L` | `\lim_{}` | 极限 |
| `8` | `\infty` | 无穷 |
| `'` | `'` | 撇号 |
| `+` | `\pm` | 正负号 |
| `= \|` | `\neq` | 不等号 |

### 重音与修饰

| 按键 | 插入 | 说明 |
| :--- | :--- | :--- |
| `"` | `\ddot{}` | 二阶导点 |
| `H` | `\hat{}` | 尖帽 |
| `\` | `\grave{}` | 重音符 |
| `/` | `\acute{}` | 锐音符 |
| `&` | `\tilde{}` | 波浪 |
| `-` | `\bar{}` | 上横线 |
| `.` | `\dot{}` | 一阶导点 |
| `Shift+V` | `\breve{}` | 短音 |
| `Shift+U` | `\check{}` | 抑扬 |
| `V` | `\vec{}` | 向量箭头 |
| `_` | `\underline{}` | 下划线 |
| `B` | `\overline{}` | 上划线 |
| `A W` | `\widehat{}` | 宽尖帽 |

### 定界符

| 按键 | 插入 | 说明 |
| :--- | :--- | :--- |
| `(` | `\left(\right)` | 圆括号 |
| `[` | `\left[\right]` | 方括号 |
| `{` | `\left\{\right\}` | 花括号 |
| `<` | `\left\langle\right\rangle` | 尖括号 |
| `>` | `\left)\right(` | 反圆括号 |
| `\|` | `\left\|\right\|` | 竖线 |
| `B N` | `\left\|\right\|` | 范数 |
| `B F` | `\left\lfloor\right\rfloor` | 下取整 |
| `B E` | `\left\lceil\right\rceil` | 上取整 |

### 希腊字母 — 小写（`G` + 键）

| 按键 | 插入 | 按键 | 插入 |
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

### 希腊字母 — 大写与变体（`G Shift+` + 键）

| 按键 | 插入 | 按键 | 插入 |
| :--- | :--- | :--- | :--- |
| `G Shift+D` | `\Delta` | `G Shift+S` | `\Sigma` |
| `G Shift+E` | `\varepsilon` | `G Shift+T` | `\varsigma` |
| `G Shift+F` | `\Phi` | `G Shift+U` | `\Upsilon` |
| `G Shift+G` | `\Gamma` | `G Shift+V` | `\Theta` |
| `G Shift+L` | `\Lambda` | `G Shift+O` | `\Omega` |
| `G Shift+P` | `\Pi` | `G Shift+X` | `\Xi` |
| | | `G Shift+Y` | `\Psi` |

### 扩展前缀

**箭头**（`W` 前缀）：`W R` `\rightarrow`，`W L` `\leftarrow`，`W Shift+R` `\Rightarrow`，`W Shift+L` `\Leftarrow`，`W M` `\mapsto`

**运算符**（`O` 前缀）：`O T` `\times`，`O C` `\cdot`，`O D` `\div`，`O E` `\equiv`，`O L` `\leq`，`O G` `\geq`，`O A` `\approx`，`O I` `\in`，`O U` `\cup`，`O Shift+U` `\cap`，`O Shift+N` `\nabla`

**字体**（`T` 前缀）：`T B` `\mathbf{}`，`T C` `\mathcal{}`，`T R` `\mathrm{}`，`T Shift+R` `\mathbb{}`，`T T` `\text{}`

**矩阵**（`M` 前缀）：`M P` pmatrix，`M B` bmatrix，`M C` cases。界面预览使用紧凑的 2×2 矩阵或两行 cases 示例；实际插入时仍会生成空环境并将光标放入其中。

完整列表见 [`shortcuts.yaml`](shortcuts.yaml)（103 条默认快捷键）。

---

## 行间公式环境包裹

在 `$$…$$` 内，或在笔记任意位置（若尚未有行间块会先自动插入）：

1. 按 leader 之后配置的快捷键（默认 **`Shift+E`**），或在命令面板运行 **Wrap display math with environment**。
2. 从模糊搜索列表中选择环境。
3. 插件会包裹**整个块内容**（不仅是选区），并让定界符和环境标记各自位于独立行。

   ```latex
   $$
   \begin{aligned}
   \alpha+\beta
   \end{aligned}
   $$
   ```

需要创建行间公式时，创建公式块与添加环境会作为一次编辑事务提交，因此一次撤销即可完整回退。取消选择器不会修改笔记。

在 **设置 → Math Chords** 的 **Enable environment wrap**（启用环境包裹）中配置环境与触发按键；也可在 **设置 → 快捷键** 中为上述命令绑定热键。设置栏较窄时，环境表格可以横向滚动；空间允许时会保留紧凑的顺序和名称列，极窄时则取消固定以避免遮挡主要内容。

默认环境：`aligned`、`matrix`、`cases`、`gathered`。

---

## 配置

### `shortcuts.yaml`

快捷键为 YAML 数组。**leader 键**在设置中全局配置，不写在每条记录里。

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

| 字段 | 必填 | 说明 |
| :--- | :---: | :--- |
| `keys` | 是 | leader 之后的按键序列。空格分隔；修饰键用 `+`（如 `Shift+S`、`G A`）。 |
| `command` | 是 | LaTeX 片段。`$$` 表示光标/选区位置。设置界面中写 `\frac` 即可，无需 `\\frac`（会自动规范化）。 |
| `name` | 否 | 设置表与 which-key 面板中的显示名称。 |
| `group` | 否 | 设置表中的分组标签。 |

特殊命令 `__DISPLAY_MATH__` 用于插入 `$$…$$` 块，可将其分配给自定义快捷键。

### 按键规范化

- 按键规范为小写 `修饰键+基键` 顺序：`ctrl` → `alt` → `shift` → `meta`。
- 字母默认小写，除非显式写 `Shift`（如 `Shift+A`）。
- 字面量 `+` 可以作为基键。若当前键盘布局需要按 Shift 才能输入某个标点，会优先匹配显式的 `Shift+标点` 绑定；不存在该绑定时再匹配标点本身。

## LaTeX 定界符转换

Math Chords 可以只替换标准 LaTeX 数学定界符，并原样保留公式内容、空白和换行：

- `\(...\)` → `$...$`
- `\[...\]` → `$$...$$`

对选中文本使用 **Convert LaTeX Delimiters in Selection**，或对当前 Markdown 笔记使用 **Convert LaTeX Delimiters in Current File**。整文件命令完成后会显示转换的行间公式与行内公式数量。每条命令只提交一次编辑事务，因此一次撤销即可回退整个转换。

转换器不会修改 YAML frontmatter、围栏代码块、行内代码、HTML 注释、HTML `<pre>` / `<code>` 块以及已有 `$...$` / `$$...$$` 数学区域中的定界符。已有 Markdown 数学区域按有效定界符规则识别，不会把普通货币文本误判为公式。多个编辑器选区会在同一次事务中处理。

若希望粘贴时也执行相同的上下文感知转换，可开启 **Automatically convert pasted LaTeX math delimiters**；该设置默认关闭。如果其他编辑器扩展已经处理了当前粘贴事件，本插件不会再次接管。

---

## TikZ 渲染

TikZ 渲染是可选功能，默认关闭，以免接管已由其他插件处理的代码块。启用后，
使用所配置标识（默认 `tikz`）的围栏代码块会立即在阅读视图中注册渲染，无需重启。
编辑实时预览使用单独开关，不会替换 CodeMirror 内容或向编辑排版中插入组件：
点击 TikZ 代码块时打开独立的可拖曳、可缩放实时渲染窗口，点击其他位置时自动关闭。
首张图完成前会保留源码，编辑过程中也会保留上一张成功图，不会被临时错误替换。
图形完整适应窗口且不显示滚动条。在桌面端，点击导出按钮会直接打开系统保存对话框；文件名
使用 `.svg`、`.png`、`.jpg`/`.jpeg` 或 `.pdf` 后缀即可选择对应格式。

阅读视图只会启动视口附近图形的渲染。完成的结果保存在有上限的内存缓存（最多 24 项 / 16 MiB）和持久缓存（最多 96 项 / 32 MiB）中，因此再次查看未改动的图形通常无需重新编译。设置页提供精简的诊断工具，可复制后端报告、清除缓存或重启渲染引擎，不增加状态栏项目。

```tikz
\begin{tikzpicture}
  \draw[->] (0,0) -- (2,0);
  \node at (2.3,0) {$\rho$};
\end{tikzpicture}
```

TikZ 与公式输入属于同一种“源码优先”工作流：代码块仍是普通 Markdown，切换后端
不会改写笔记。内置渲染器中的节点公式交给 Obsidian MathJax 排版，因此与普通
Markdown 公式保持一致。

- **内置 WASM（默认并推荐）：**使用 Math Chords 原创的 Rust 矢量核心，启动快，无需安装 TeX，也不会在运行时下载引擎，渲染工作避开主编辑线程。它是主要渲染器，后续 TikZ 语法会直接在这套核心中扩展。
- **本机 TeX（高级兼容模式）：**需要桌面端已安装 TeX，并因启动外部工具链而明显更慢。它适合 `pgfplots`、`circuitikz` 等宏包、文档专用宏和样式、特殊 OpenType/CJK 字体，以及必须与正式 TeX 编译结果一致的场景。Math Chords 可从 TeX Live、MiKTeX、MacTeX、TinyTeX、Tectonic、PATH 或用户指定路径检测兼容引擎。
- **自动模式：**受支持的图形使用与手动 WASM 完全相同的实例和缓存；当能力检查确认某些语法无法忠实复现或 WASM 失败时，再选择本机 TeX。这样既保留快速路径，也避免返回看似可用但实际错误的图形。

这样的分工让普通用户获得快速、免安装的默认体验，同时把完整 TeX 生态作为明确的
专业出口保留下来。插件不会下载渲染引擎，也不会静默安装 TeX。

只渲染你信任的 TikZ 源码。虽然本机后端会关闭 shell escape 并限制 TeX 文件访问，但 TeX 本身仍是复杂的解释器。WASM 后端只在 Obsidian 的渲染进程内运行，不调用本机可执行文件。

在桌面端选择本机 TeX 后，Math Chords 会检查用户配置及常见位置中的 TeX
可执行文件，在系统临时目录中创建有大小限制的工作文件，并直接启动所选程序而不经过
命令行 shell。导出只会写入系统保存对话框中由用户选择的路径。剪贴板访问仅用于用户
粘贴事件和明确触发的“复制诊断报告”操作。

如需支持屏幕阅读器，可在源码首行加入简短说明，例如
`% alt: 点质量周围的引力场`。该注释仍是合法 TikZ 源码，并会作为渲染图形的无障碍名称。

---

## 设置

打开 **设置 → Math Chords**。在有可用翻译时，设置界面会跟随 Obsidian 的显示语言。在 Obsidian 1.13.0 及更高版本中，各项 Math Chords 设置也会被 Obsidian 的设置搜索单独索引。

全部 72 个语言包都内置于 `main.js`，社区插件安装与手动安装均不需要额外下载语言
文件。十种主要语言持续维护完整翻译；其他 Obsidian 语言在尚无经过审校的翻译时
使用当前英语回退文本，避免保留过期文案。

| 设置项 | 默认值 | 说明 |
| :--- | :--- | :--- |
| Enable plugin（启用插件） | 开 | leader 快捷键总开关。 |
| Leader key（Leader 键） | `Alt+M` | 快捷键前缀；YAML 中 `keys` 为 leader 之后的部分。 |
| Show shortcut hints（显示快捷键提示） | 开 | leader 后显示 which-key 面板。 |
| Auto-wrap outside math（公式外自动包裹） | 开 | 非公式区域插入时自动加 `$…$`。 |
| Smart math toggle（智能公式切换） | 开 | 允许用另一种公式命令转换现有公式块；同类型命令始终移除包裹。 |
| Inline math live preview（行内公式实时预览） | 开 | 在 `$…$` 上方 MathJax 预览。 |
| Enable TikZ rendering（启用 TikZ 渲染） | 关 | 立即注册 TikZ 围栏代码块渲染；关闭后若要为其他插件彻底释放处理器，再重启 Obsidian。 |
| TikZ live preview while editing（编辑时实时预览） | 关 | 打开 TikZ 代码块时立即开始首次渲染；后续编辑经过可配置的延迟再渲染，默认 250 毫秒，并在新结果完成前保留上一帧。 |
| TikZ code-block identifier（代码块标识） | `tikz` | 代码块起始标记后的文字；仅在其他渲染器已使用 `tikz` 时修改。 |
| TikZ backend（渲染后端） | 内置 | 使用推荐的自包含 WASM、显式本机 TeX 兼容模式，或自动模式；自动模式让受支持图形留在 WASM，仅在无法保证忠实输出时回退。 |
| Local TeX installation（本机 TeX 安装） | 自动检测 | 默认从系统和常见安装位置检测 TeX；也可填写可执行文件或发行版目录覆盖自动结果。 |
| TikZ custom fonts（自定义字体） | 关 | 默认按语言自动选择字体。启用这个高级区域后，才显示拉丁、简中、繁中、日文和韩文字体设置。 |
| TikZ diagnostics（诊断） | — | 复制后端可用性和最近渲染信息、清除有上限的缓存，或重启渲染引擎。 |
| Enable formula panel（启用公式面板） | 开 | 显示可搜索的快捷键/模板侧边栏，包括持久收藏和最多 12 项的最近模板；关闭时移除 Ribbon 入口、关闭面板并停用命令。 |
| Brace navigation in math（公式内大括号跳转） | 开 | 在公式内 `{…}` 之间跳转；默认 `Alt+→` / `Alt+←`。 |
| Next / previous brace keys（下/上一大括号键） | `Alt+→` / `Alt+←` | 大括号跳转快捷键（启用后生效）。 |
| Automatically convert pasted LaTeX math delimiters（自动转换粘贴的 LaTeX 数学定界符） | 关 | 安全转换粘贴文本中的 `\(...\)` / `\[...\]`。 |
| Enable environment wrap（启用环境包裹） | 开 | 环境选择器；必要时在一次事务中创建并包裹 `$$…$$`。 |
| Environment wrap keys（环境包裹快捷键） | `Shift+E` | leader 之后触发环境选择器的按键。 |
| Math environments（数学环境） | 4 个内置 | 可编辑的环境列表。 |

**内置命令**（可在 **设置 → 快捷键** 中绑定或修改）：**Open formula panel**、**Insert inline math**、**Insert display math**、**Wrap display math with environment**、**Convert LaTeX Delimiters in Selection**、**Convert LaTeX Delimiters in Current File**。

所有内置命令均不注册默认快捷键；需要时可在 **设置 → 快捷键** 中自行绑定。

- `Insert inline math`：将非空选区包裹为 `$…$`；仅有光标时，在公式外插入行内公式、在行内公式内移除包裹，或在开启 **Smart math toggle** 后将行间公式转为行内。
- `Insert display math`：将非空选区包裹为 `$$…$$`；仅有光标时，在公式外插入行间公式、在行间公式内移除包裹，或在开启 **Smart math toggle** 后将行内公式转为行间。

关闭跨类型转换后，在现有公式块内调用另一种公式命令会保持笔记不变并显示提示，不会生成无效的嵌套定界符。行间公式转为行内公式时，会移除包裹旁的一组换行，并将内容中其余换行替换为空格，因为 Markdown 行内公式无法可靠地跨行。

**Shortcut management（快捷键管理）：** 快捷键按分组显示为紧凑、基于容器宽度响应的列表。每一行保留易读名称和原始 LaTeX 命令，同时提供动态生成的 MathJax 预览与键帽式按键序列；设置栏较窄时，按键和操作按钮会移动到独立行，不会被挤压隐藏。公式预览仅在条目接近可视区域时渲染，打开设置页不会一次性排版整个目录。搜索会匹配按键、名称、命令和分组，且不会重建整个设置页。添加和编辑使用标题对齐的原生对话框，删除前需要确认。**Reload** 重新读取 YAML；**Merge defaults** 追加缺失的内置项，不覆盖已有绑定。公式预览只用于界面展示，不会写入 `shortcuts.yaml`。

**Template management（模板管理）：** 使用与数学面板相同的递归树和自由重排方式。拖动手柄可调整同级顺序、移入其他文件夹或移回根目录；聚焦手柄后可用方向键调整同级位置。根目录和文件夹工具栏都明确区分“新建文件夹”与“新建模板”。文件夹可以为空；搜索同时匹配模板标题和 Markdown 正文。标题、源码内容、树形顺序及收起状态都保存在插件设置中。

---

## 更新快捷键

插件加载时（或点击 **Reload** / **Merge defaults**）：

1. 已有 YAML 条目**原样保留**（相同 `keys` → 相同绑定）。
2. 尚未出现的默认快捷键会**追加**到文件末尾。
3. 更新后的内容写回 `shortcuts.yaml`。

若要完全重置，删除 `shortcuts.yaml` 后重新加载插件（会重新生成默认文件）。

从 TypeScript 重新生成仓库默认 YAML：

```bash
npm run seed
```

---

## 项目结构

```
math-chords/                  # 插件 id；安装目录 .obsidian/plugins/math-chords/
├── src/                    # TypeScript 源码
│   ├── main.ts             # 插件入口
│   ├── leader.ts           # Leader 快捷键状态机
│   ├── braceNav.ts         # 公式内大括号跳转
│   ├── delimiterConverter.ts # 纯函数形式的受保护定界符转换
│   ├── delimiterEditor.ts  # 定界符转换的 Obsidian 编辑事务
│   ├── formulaPanel.ts      # 可搜索的 Obsidian 公式侧边栏
│   ├── formulaPanelModel.ts # 纯函数形式的面板分组与筛选模型
│   ├── markdownProtection.ts # 共享 Markdown 保护区解析器
│   ├── mathToggle.ts       # 纯函数形式的行内/行间切换与转换规划
│   ├── mathEnvPlan.ts      # 纯函数形式的单事务环境包裹规划
│   ├── defaults.ts         # 默认快捷键目录
│   ├── config.ts           # YAML 读写与合并
│   ├── shortcutPreviewRenderer.ts # 共享的延迟 MathJax 预览渲染
│   ├── l10n/               # 压缩的离线语言包
│   ├── tikz/               # 调度、后端、预览、安全清洗与导出
│   └── …                   # 公式、模板、设置界面等
├── crates/
│   └── chord-tikz-core/    # 原创、无第三方依赖的 Rust/WASM 渲染器
├── tests/
│   ├── unit/               # Vitest 单元测试与回归测试
│   └── performance/        # 按需运行的解析性能基准
├── vitest.config.ts
├── shortcuts.yaml          # 随仓库分发的默认快捷键（103 条）
├── styles.css              # 预览与设置样式
├── manifest.json           # Obsidian 插件清单
├── scripts/                 # 生成、共享脚本工具与校验逻辑
├── .github/                 # CI、发布、Dependabot 与贡献模板
├── AGENTS.md                # 统一的 Codex、工程与工作流规范
├── ARCHITECTURE.zh-CN.md    # 运行、渲染、缓存与信任边界
├── CONTRIBUTING.zh-CN.md    # 贡献流程与提交要求
├── SECURITY.md              # 私密漏洞报告策略
├── CODE_OF_CONDUCT.md       # 社区参与行为准则
├── eslint.config.mts        # Obsidian 规则感知的代码检查配置
├── .editorconfig            # 编辑器编码与空白规则
├── .gitattributes           # 换行与二进制文件规则
└── esbuild.config.mjs       # 构建配置
```

---

## 开发

开发环境需要 Node.js `20.19+` 或 `22.12+`，具体约束见 `package.json`。

```bash
npm install
npm run dev    # 监听模式构建
npm run lint   # ESLint + Obsidian 插件规则
npm run build  # 类型检查 + 生产构建
npm test       # Vitest 单元测试
npm run bench  # 按需运行解析器与定界符转换性能基准
npm run seed   # 从 src/defaults.ts 重写 shortcuts.yaml
npm run check:shortcuts # 检查 shortcuts.yaml 是否与 src/defaults.ts 一致
npm run seed:locales  # 从 scripts/locale-catalog.json 生成全部内置 TS 语言包
npm run check:locales # 检查语言键结构及全部生成物
npm run check:release # 检查元数据、Changelog 与 README 版本引用
npm run check  # 完整执行构建、测试、生成物与元数据检查
```

统一的 Codex 指导以及模块、安全、生成和发布规范见 [`AGENTS.md`](AGENTS.md)。
仓库目前不需要项目级 Codex 运行配置，因此不提供 `.codex/config.toml`。

欢迎提交 Pull Request。请遵循 [中文贡献指南](CONTRIBUTING.zh-CN.md)，提交前运行
`npm run check`；涉及编辑器集成的行为还应在 Obsidian 中完成相应手动测试。

社区参与须遵守[行为准则](CODE_OF_CONDUCT.zh-CN.md)。安全漏洞请通过[安全策略](SECURITY.zh-CN.md)中的方式私下报告。

未来可能开展的工作及其设计约束记录在[路线图](ROADMAP.zh-CN.md)中。

### 发布

1. 维护者确认发布后，统一更新 `package.json`、`package-lock.json` 和 `manifest.json` 中的版本，并在 `versions.json` 中添加最低 Obsidian 版本映射。
2. 将 Changelog 的 `Unreleased` 内容转为带日期的发布章节，并在其上方重新建立空的 `Unreleased` 章节；同时更新中英文 README 的当前版本说明，版本徽章会自动跟随最新 GitHub Release。
3. 运行 `npm run check`，复核发布资产，并完成相关的 Obsidian 应用内验收。
4. 提交后打精确版本 tag（不要加 `v` 前缀），例如 `git tag 0.3.0 && git push origin 0.3.0`。
5. [release 工作流](.github/workflows/release.yml) 会重新执行完整检查、构建并附上 `main.js`、`manifest.json` 和 `styles.css`，同时为全部资产生成 artifact attestations；不会删除或重建已有 Release。

---

## AI 辅助说明

本仓库曾使用 Cursor 和大语言模型等 **AI 辅助开发工具**，目前主要使用 OpenAI Codex 进行维护。这些工具用于部分草拟、重构、测试设计、文档整理和一致性检查；功能范围、架构取舍、合入内容与发布决定仍由维护者负责。

- AI 辅助不能替代代码审阅、自动化检查及必要的 Obsidian 手动测试。
- 贡献者必须理解并审阅所提交的每项修改，并对正确性、许可证兼容性、内容来源及私密信息保护负责。
- 若 AI 工具对修改产生实质影响，应在 Pull Request 中如实说明。
- 使用范围、验证方式和贡献要求详见 [AI 辅助开发说明](AI-ASSISTANCE.zh-CN.md)。

---

## 许可证

[MIT](LICENSE) © [CHEH Hua](https://github.com/ichenh)
