import { Plugin, PluginSettingTab, App, Setting } from "obsidian";
import { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { createBlockDndPlugin, blockDecorationField } from "./cm-plugin";
import { resolveBlocks, blockAtPos } from "./block-resolver";
import { buildMoveUpTransaction, buildMoveDownTransaction } from "./drop-engine";

interface BlockDndSettings {
  handlePosition: "left-gutter" | "left-margin";
  handleVisibility: "hover" | "always";
  dragThreshold: number;
  enableMultiSelect: boolean;
  enableTouchDrag: boolean;
}

const DEFAULT_SETTINGS: BlockDndSettings = {
  handlePosition: "left-gutter",
  handleVisibility: "hover",
  dragThreshold: 5,
  enableMultiSelect: true,
  enableTouchDrag: false,
};

export default class BlockDndPlugin extends Plugin {
  settings: BlockDndSettings = DEFAULT_SETTINGS;
  private editorExtensions: Extension[] = [];

  async onload(): Promise<void> {
    await this.loadSettings();

    // Build and register CM6 extensions
    this.buildExtensions();
    this.registerEditorExtension(this.editorExtensions);

    // Register keyboard commands (no default hotkeys — user assigns them)
    this.addCommand({
      id: "move-block-up",
      name: "Move block up",
      editorCallback: (editor) => {
        // @ts-expect-error — Obsidian exposes cm on the editor object
        const view: EditorView | undefined = editor.cm;
        if (!view) return;

        const state = view.state;
        const cursorPos = state.selection.main.head;
        const blocks = resolveBlocks(state);
        const block = blockAtPos(blocks, cursorPos);
        if (!block) return;

        const tx = buildMoveUpTransaction(state, blocks, block.index);
        if (tx) {
          view.dispatch(tx);
        }
      },
    });

    this.addCommand({
      id: "move-block-down",
      name: "Move block down",
      editorCallback: (editor) => {
        // @ts-expect-error — Obsidian exposes cm on the editor object
        const view: EditorView | undefined = editor.cm;
        if (!view) return;

        const state = view.state;
        const cursorPos = state.selection.main.head;
        const blocks = resolveBlocks(state);
        const block = blockAtPos(blocks, cursorPos);
        if (!block) return;

        const tx = buildMoveDownTransaction(state, blocks, block.index);
        if (tx) {
          view.dispatch(tx);
        }
      },
    });

    // Settings tab
    this.addSettingTab(new BlockDndSettingTab(this.app, this));
  }

  onunload(): void {
    // Extensions are automatically cleaned up by Obsidian
  }

  private buildExtensions(): void {
    this.editorExtensions.length = 0;
    this.editorExtensions.push(
      blockDecorationField,
      createBlockDndPlugin({
        dragThreshold: this.settings.dragThreshold,
        enableMultiSelect: this.settings.enableMultiSelect,
      })
    );
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

class BlockDndSettingTab extends PluginSettingTab {
  plugin: BlockDndPlugin;

  constructor(app: App, plugin: BlockDndPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Handle position")
      .setDesc("Where the drag handle appears relative to the content.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left-gutter", "Left gutter")
          .addOption("left-margin", "Left margin")
          .setValue(this.plugin.settings.handlePosition)
          .onChange(async (value) => {
            this.plugin.settings.handlePosition = value as "left-gutter" | "left-margin";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Handle visibility")
      .setDesc("Show handles always or only on hover.")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("hover", "On hover")
          .addOption("always", "Always visible")
          .setValue(this.plugin.settings.handleVisibility)
          .onChange(async (value) => {
            this.plugin.settings.handleVisibility = value as "hover" | "always";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Drag threshold")
      .setDesc("Minimum mouse movement in pixels before a drag starts.")
      .addSlider((slider) =>
        slider
          .setLimits(1, 20, 1)
          .setValue(this.plugin.settings.dragThreshold)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.dragThreshold = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Multi-block selection")
      .setDesc("Allow selecting multiple blocks with Shift-click and Ctrl/Cmd-click.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableMultiSelect)
          .onChange(async (value) => {
            this.plugin.settings.enableMultiSelect = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Touch drag (experimental)")
      .setDesc("Enable drag and drop on touch devices.")
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTouchDrag)
          .onChange(async (value) => {
            this.plugin.settings.enableTouchDrag = value;
            await this.plugin.saveSettings();
          })
      );
  }
}
