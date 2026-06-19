import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { normalizeCommand } from "./config";
import { validateMathEnvironment } from "./mathEnv";
import type ObsidianMathChordsPlugin from "./main";
import type { MathEnvironment, Shortcut } from "./types";
import { shortcutStorageKey } from "./trie";

export class ObsidianMathChordsSettingTab extends PluginSettingTab {
  plugin: ObsidianMathChordsPlugin;
  private search = "";

  constructor(app: App, plugin: ObsidianMathChordsPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Math Chords" });

    containerEl.createEl("p", {
      cls: "obsidian-math-chords-intro",
      text: "按 Alt+M（可配置 leader 键）后接按键序列插入 LaTeX。内置默认快捷键参考了 LyX 数学模式的绑定。",
    });

    new Setting(containerEl)
      .setName("启用插件")
      .setDesc("关闭后禁用 leader 快捷键序列。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("显示快捷键提示")
      .setDesc("按下 leader 后在光标附近显示 which-key 面板。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHintPopup).onChange(async (value) => {
          this.plugin.settings.showHintPopup = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("行内公式实时预览")
      .setDesc("光标位于 $…$ 内时，在公式上方用 Obsidian 默认 MathJax 渲染预览。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInlinePreview).onChange(async (value) => {
          this.plugin.settings.showInlinePreview = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Leader 键")
      .setDesc('默认 "Alt+M"。各快捷键的「按键序列」填写 leader 之后按下的键，例如 "F"、"G A"。')
      .addText((text) =>
        text.setValue(this.plugin.settings.leaderKey).onChange(async (value) => {
          this.plugin.settings.leaderKey = value.trim() || "Alt+M";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("公式外自动包裹")
      .setDesc("在公式区域外插入符号时自动用 $...$ 包裹。")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wrapOutsideMath).onChange(async (value) => {
          this.plugin.settings.wrapOutsideMath = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("重新加载 YAML")
      .setDesc("从 shortcuts.yaml 重新读取快捷键配置。")
      .addButton((button) =>
        button.setButtonText("Reload").onClick(async () => {
          await this.plugin.reloadShortcuts();
          new Notice("已重新加载 shortcuts.yaml");
          this.display();
        }),
      )
      .addButton((button) =>
        button.setButtonText("合并默认").onClick(async () => {
          const count = await this.plugin.mergeDefaultShortcuts();
          new Notice(
            count > 0 ? `已合并 ${count} 条默认快捷键（保留你的自定义项）` : "没有可合并的新快捷键",
          );
          this.display();
        }),
      );

    containerEl.createEl("h3", { text: "行间公式环境包裹" });

    new Setting(containerEl)
      .setName("启用环境包裹")
      .setDesc(
        "通过 leader 快捷键或命令面板「Wrap display math with environment」（可在 Obsidian 快捷键设置中绑定）弹出环境列表。光标不在 $$…$$ 内时会先插入行间公式块。",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mathEnvWrapEnabled).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("环境包裹快捷键")
      .setDesc('leader 之后的按键序列，例如 "Shift+E"。')
      .addText((text) =>
        text.setValue(this.plugin.settings.mathEnvWrapKeys).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapKeys = value.trim() || "Shift+E";
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("数学环境")
      .addButton((button) =>
        button.setButtonText("添加").onClick(() => {
          new MathEnvironmentEditorModal(this.app, null, async (entry) => {
            if (!entry) return;
            this.plugin.settings.mathEnvironments.push(entry);
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }),
      );

    const envTable = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const envHeader = envTable.createEl("thead").createEl("tr");
    for (const label of ["名称", "开始", "结束", "操作"]) {
      envHeader.createEl("th", { text: label });
    }

    const envBody = envTable.createEl("tbody");
    for (let index = 0; index < this.plugin.settings.mathEnvironments.length; index++) {
      const entry = this.plugin.settings.mathEnvironments[index];
      const row = envBody.createEl("tr");
      row.createEl("td", { text: entry.name });
      row.createEl("td", { text: entry.begin });
      row.createEl("td", { text: entry.end });

      const actions = row.createEl("td");
      actions.createEl("button", { text: "编辑", cls: "mod-small" }).addEventListener("click", () => {
        new MathEnvironmentEditorModal(this.app, entry, async (updated) => {
          if (!updated) return;
          this.plugin.settings.mathEnvironments[index] = updated;
          await this.plugin.saveSettings();
          this.display();
        }).open();
      });

      actions.createEl("button", { text: "删除", cls: "mod-small" }).addEventListener("click", async () => {
        this.plugin.settings.mathEnvironments.splice(index, 1);
        await this.plugin.saveSettings();
        this.display();
      });
    }

    containerEl.createEl("h3", { text: "快捷键管理" });

    new Setting(containerEl)
      .setName("搜索")
      .addText((text) =>
        text
          .setPlaceholder("按键或命令")
          .setValue(this.search)
          .onChange((value) => {
            this.search = value;
            this.display();
          }),
      )
      .addButton((button) =>
        button.setButtonText("添加").onClick(() => {
          new ShortcutEditorModal(this.app, null, async (entry) => {
            if (!entry) return;
            this.plugin.shortcuts.set(shortcutStorageKey(entry), entry);
            await this.plugin.persistShortcuts();
            this.display();
          }).open();
        }),
      );

    const table = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const header = table.createEl("thead").createEl("tr");
    for (const label of ["按键", "命令", "名称", "分组", "操作"]) {
      header.createEl("th", { text: label });
    }

    const tbody = table.createEl("tbody");
    const query = this.search.trim().toLowerCase();

    for (const [key, entry] of this.plugin.shortcuts.entries()) {
      const haystack = `${entry.keys} ${entry.command} ${entry.name ?? ""} ${entry.group ?? ""}`.toLowerCase();
      if (query && !haystack.includes(query)) continue;

      const row = tbody.createEl("tr");
      row.createEl("td", { text: entry.keys });
      row.createEl("td", { text: entry.command });
      row.createEl("td", { text: entry.name ?? "" });
      row.createEl("td", { text: entry.group ?? "" });

      const actions = row.createEl("td");
      actions.createEl("button", { text: "编辑", cls: "mod-small" }).addEventListener("click", () => {
        new ShortcutEditorModal(this.app, entry, async (updated) => {
          if (!updated) return;
          if (key !== shortcutStorageKey(updated)) this.plugin.shortcuts.delete(key);
          this.plugin.shortcuts.set(shortcutStorageKey(updated), updated);
          await this.plugin.persistShortcuts();
          this.display();
        }).open();
      });

      actions.createEl("button", { text: "删除", cls: "mod-small" }).addEventListener("click", async () => {
        this.plugin.shortcuts.delete(key);
        await this.plugin.persistShortcuts();
        this.display();
      });
    }
  }
}

class ShortcutEditorModal extends Modal {
  private readonly initial: Shortcut | null;
  private readonly onSave: (entry: Shortcut | null) => void;
  private entry: Shortcut;

  constructor(app: App, initial: Shortcut | null, onSave: (entry: Shortcut | null) => void) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
    this.entry = initial
      ? { ...initial }
      : { keys: "", command: "", name: "", group: "" };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.initial ? "编辑快捷键" : "添加快捷键" });

    new Setting(contentEl)
      .setName("按键序列")
      .setDesc('Leader 之后按下的键。例：分数 "F"，α "G A"，不等号 "= |"。')
      .addText((text) =>
        text.setValue(this.entry.keys).onChange((value) => {
          this.entry.keys = value;
        }),
      );

    new Setting(contentEl)
      .setName("命令")
      .setDesc("LaTeX 片段，$$ 为光标占位符。直接输入 \\frac{$$}{}，无需写成 \\\\frac。")
      .addText((text) =>
        text.setValue(this.entry.command).onChange((value) => {
          this.entry.command = value;
        }),
      );

    new Setting(contentEl).setName("名称").addText((text) =>
      text.setValue(this.entry.name ?? "").onChange((value) => {
        this.entry.name = value;
      }),
    );

    new Setting(contentEl).setName("分组").addText((text) =>
      text.setValue(this.entry.group ?? "").onChange((value) => {
        this.entry.group = value;
      }),
    );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("保存")
          .setCta()
          .onClick(() => {
            if (!this.entry.keys.trim() || !this.entry.command.trim()) {
              new Notice("按键与命令不能为空");
              return;
            }
            this.entry.command = normalizeCommand(this.entry.command);
            this.onSave(this.entry);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()));
  }
}

class MathEnvironmentEditorModal extends Modal {
  private readonly initial: MathEnvironment | null;
  private readonly onSave: (entry: MathEnvironment | null) => void;
  private entry: MathEnvironment;

  constructor(
    app: App,
    initial: MathEnvironment | null,
    onSave: (entry: MathEnvironment | null) => void,
  ) {
    super(app);
    this.initial = initial;
    this.onSave = onSave;
    this.entry = initial
      ? { ...initial }
      : { name: "", begin: "", end: "" };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.initial ? "编辑数学环境" : "添加数学环境" });

    new Setting(contentEl)
      .setName("名称")
      .setDesc("在环境选择列表中显示的名称，例如 aligned。")
      .addText((text) =>
        text.setValue(this.entry.name).onChange((value) => {
          this.entry.name = value;
        }),
      );

    new Setting(contentEl)
      .setName("开始")
      .setDesc("插入到公式内容前的 LaTeX，例如 \\begin{aligned}。")
      .addText((text) =>
        text.setValue(this.entry.begin).onChange((value) => {
          this.entry.begin = value;
        }),
      );

    new Setting(contentEl)
      .setName("结束")
      .setDesc("插入到公式内容后的 LaTeX，例如 \\end{aligned}。")
      .addText((text) =>
        text.setValue(this.entry.end).onChange((value) => {
          this.entry.end = value;
        }),
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("保存")
          .setCta()
          .onClick(() => {
            const validated = validateMathEnvironment(this.entry);
            if (!validated) {
              new Notice("名称、开始与结束均不能为空");
              return;
            }
            this.onSave(validated);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText("取消").onClick(() => this.close()));
  }
}
