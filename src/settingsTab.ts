import { App, Modal, Notice, PluginSettingTab, Setting } from "obsidian";
import { normalizeCommand } from "./config";
import { runWithNotice } from "./errors";
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

    containerEl.createEl("p", {
      cls: "obsidian-math-chords-intro",
      text: 'Press a configurable leader key (default Alt+M), then a key sequence to insert LaTeX. Default shortcuts are inspired by LyX math-mode bindings.',
    });

    new Setting(containerEl)
      .setName("Enable plugin")
      .setDesc("Turn off to disable leader-key chord sequences.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Show shortcut hints")
      .setDesc("Show a which-key panel near the caret after pressing the leader key.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showHintPopup).onChange(async (value) => {
          this.plugin.settings.showHintPopup = value;
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Inline math live preview")
      .setDesc("While the caret is inside $…$, show a MathJax preview above the formula.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showInlinePreview).onChange(async (value) => {
          this.plugin.settings.showInlinePreview = value;
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Leader key")
      .setDesc('Default "Alt+M". Key sequences in shortcuts.yaml are pressed after the leader, e.g. "F" or "G A".')
      .addText((text) =>
        text.setValue(this.plugin.settings.leaderKey).onChange(async (value) => {
          this.plugin.settings.leaderKey = value.trim() || "Alt+M";
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Auto-wrap outside math")
      .setDesc("When inserting outside a math region, wrap the snippet in $…$.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.wrapOutsideMath).onChange(async (value) => {
          this.plugin.settings.wrapOutsideMath = value;
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Reload YAML")
      .setDesc("Reload shortcut bindings from shortcuts.yaml.")
      .addButton((button) =>
        button.setButtonText("Reload").onClick(async () => {
          await runWithNotice(async () => {
            await this.plugin.reloadShortcuts();
            new Notice("Reloaded shortcuts.yaml.");
            this.display();
          }, "Math Chords: could not reload shortcuts.yaml.");
        }),
      )
      .addButton((button) =>
        button.setButtonText("Merge defaults").onClick(async () => {
          await runWithNotice(async () => {
            const count = await this.plugin.mergeDefaultShortcuts();
            new Notice(
              count > 0
                ? `Merged ${count} default shortcut(s); your custom bindings were kept.`
                : "No new default shortcuts to merge.",
            );
            this.display();
          }, "Math Chords: could not merge default shortcuts.");
        }),
      );

    new Setting(containerEl).setName("Display-math environment wrap").setHeading();

    new Setting(containerEl)
      .setName("Enable environment wrap")
      .setDesc(
        'Use the leader shortcut or the command "Wrap display math with environment" (assign a hotkey in Obsidian settings). If the caret is not inside $$…$$, a display block is inserted first.',
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.mathEnvWrapEnabled).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapEnabled = value;
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Environment wrap keys")
      .setDesc('Key sequence after the leader, e.g. "Shift+E".')
      .addText((text) =>
        text.setValue(this.plugin.settings.mathEnvWrapKeys).onChange(async (value) => {
          this.plugin.settings.mathEnvWrapKeys = value.trim() || "Shift+E";
          await runWithNotice(() => this.plugin.saveSettings(), "Math Chords: could not save settings.");
        }),
      );

    new Setting(containerEl)
      .setName("Math environments")
      .addButton((button) =>
        button.setButtonText("Add").onClick(() => {
          new MathEnvironmentEditorModal(this.app, null, (entry) => {
            if (!entry) return;
            void runWithNotice(async () => {
              this.plugin.settings.mathEnvironments.push(entry);
              await this.plugin.saveSettings();
              this.display();
            }, "Math Chords: could not save settings.");
          }).open();
        }),
      );

    const envTable = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const envHeader = envTable.createEl("thead").createEl("tr");
    for (const label of ["Name", "Begin", "End", "Actions"]) {
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
      actions.createEl("button", { text: "Edit", cls: "mod-small" }).addEventListener("click", () => {
        new MathEnvironmentEditorModal(this.app, entry, (updated) => {
          if (!updated) return;
          void runWithNotice(async () => {
            this.plugin.settings.mathEnvironments[index] = updated;
            await this.plugin.saveSettings();
            this.display();
          }, "Math Chords: could not save settings.");
        }).open();
      });

      actions.createEl("button", { text: "Delete", cls: "mod-small" }).addEventListener("click", () => {
        void runWithNotice(async () => {
          this.plugin.settings.mathEnvironments.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }, "Math Chords: could not save settings.");
      });
    }

    new Setting(containerEl).setName("Shortcut management").setHeading();

    new Setting(containerEl)
      .setName("Search")
      .addText((text) =>
        text
          .setPlaceholder("Keys or command")
          .setValue(this.search)
          .onChange((value) => {
            this.search = value;
            this.display();
          }),
      )
      .addButton((button) =>
        button.setButtonText("Add").onClick(() => {
          new ShortcutEditorModal(this.app, null, (entry) => {
            if (!entry) return;
            void runWithNotice(async () => {
              this.plugin.shortcuts.set(shortcutStorageKey(entry), entry);
              await this.plugin.persistShortcuts();
              this.display();
            }, "Math Chords: could not save shortcuts.yaml.");
          }).open();
        }),
      );

    const table = containerEl.createEl("table", { cls: "obsidian-math-chords-table" });
    const header = table.createEl("thead").createEl("tr");
    for (const label of ["Keys", "Command", "Name", "Group", "Actions"]) {
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
      actions.createEl("button", { text: "Edit", cls: "mod-small" }).addEventListener("click", () => {
        new ShortcutEditorModal(this.app, entry, (updated) => {
          if (!updated) return;
          if (key !== shortcutStorageKey(updated)) this.plugin.shortcuts.delete(key);
          void runWithNotice(async () => {
            this.plugin.shortcuts.set(shortcutStorageKey(updated), updated);
            await this.plugin.persistShortcuts();
            this.display();
          }, "Math Chords: could not save shortcuts.yaml.");
        }).open();
      });

      actions.createEl("button", { text: "Delete", cls: "mod-small" }).addEventListener("click", () => {
        void runWithNotice(async () => {
          this.plugin.shortcuts.delete(key);
          await this.plugin.persistShortcuts();
          this.display();
        }, "Math Chords: could not save shortcuts.yaml.");
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
    new Setting(contentEl)
      .setName(this.initial ? "Edit shortcut" : "Add shortcut")
      .setHeading();

    new Setting(contentEl)
      .setName("Key sequence")
      .setDesc('Keys after the leader. Examples: fraction "F", alpha "G A", neq "= |".')
      .addText((text) =>
        text.setValue(this.entry.keys).onChange((value) => {
          this.entry.keys = value;
        }),
      );

    new Setting(contentEl)
      .setName("Command")
      .setDesc("LaTeX snippet; $$ marks the caret. Type \\frac{$$}{} directly.")
      .addText((text) =>
        text.setValue(this.entry.command).onChange((value) => {
          this.entry.command = value;
        }),
      );

    new Setting(contentEl).setName("Name").addText((text) =>
      text.setValue(this.entry.name ?? "").onChange((value) => {
        this.entry.name = value;
      }),
    );

    new Setting(contentEl).setName("Group").addText((text) =>
      text.setValue(this.entry.group ?? "").onChange((value) => {
        this.entry.group = value;
      }),
    );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            if (!this.entry.keys.trim() || !this.entry.command.trim()) {
              new Notice("Keys and command are required.");
              return;
            }
            this.entry.command = normalizeCommand(this.entry.command);
            this.onSave(this.entry);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
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
    new Setting(contentEl)
      .setName(this.initial ? "Edit math environment" : "Add math environment")
      .setHeading();

    new Setting(contentEl)
      .setName("Name")
      .setDesc("Label in the environment picker, e.g. aligned.")
      .addText((text) =>
        text.setValue(this.entry.name).onChange((value) => {
          this.entry.name = value;
        }),
      );

    new Setting(contentEl)
      .setName("Begin")
      .setDesc("LaTeX inserted before the content, e.g. \\begin{aligned}.")
      .addText((text) =>
        text.setValue(this.entry.begin).onChange((value) => {
          this.entry.begin = value;
        }),
      );

    new Setting(contentEl)
      .setName("End")
      .setDesc("LaTeX inserted after the content, e.g. \\end{aligned}.")
      .addText((text) =>
        text.setValue(this.entry.end).onChange((value) => {
          this.entry.end = value;
        }),
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            const validated = validateMathEnvironment(this.entry);
            if (!validated) {
              new Notice("Name, begin, and end are required.");
              return;
            }
            this.onSave(validated);
            this.close();
          }),
      )
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()));
  }
}
