# Block Drag & Drop

Drag and drop content blocks to reorder paragraphs, headings, lists, and other Markdown elements in Obsidian's Live Preview mode.

## Features

- **Drag handle** appears on hover to the left of each block.
- **Drop indicator** shows exactly where the block will land.
- **Ghost preview** follows the cursor while dragging.
- **Multi-block selection** with Shift-click (range) and Ctrl/Cmd-click (toggle).
- **Keyboard shortcuts** to move blocks up/down (assignable via Hotkeys settings).
- **Landing animation** highlights the block after it moves.
- **Single undo** for every move (Ctrl/Cmd+Z restores the original position).
- Works with paragraphs, headings, lists, code blocks, tables, callouts, blockquotes, embeds, math blocks, and thematic breaks.
- Frontmatter is never draggable.

## Usage

1. Open a note in **Live Preview** mode.
2. Hover over any block to reveal the grip handle on the left.
3. Click and drag the handle to move the block.
4. Release to drop it at the indicated position.

### Multi-block drag

- **Shift-click** handles to select a contiguous range.
- **Ctrl/Cmd-click** handles to toggle individual blocks.
- Drag any selected handle to move all selected blocks together.

### Keyboard

Assign hotkeys in **Settings > Hotkeys** for:
- **Move block up**
- **Move block down**

## Settings

| Setting | Description |
|---|---|
| Handle position | Left gutter or left margin |
| Handle visibility | On hover or always visible |
| Drag threshold | Minimum movement before a drag starts |
| Multi-block selection | Enable or disable Shift/Ctrl-click |
| Touch drag | Experimental touch support |

## Installation

### From Community Plugins

1. Open **Settings > Community plugins**.
2. Search for **Block Drag & Drop**.
3. Click **Install**, then **Enable**.

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/wepee/obsidian-block-drag-drop/releases).
2. Create a folder `<vault>/.obsidian/plugins/block-drag-drop/`.
3. Copy the three files into it.
4. Enable the plugin in **Settings > Community plugins**.

## Development

```bash
npm install
npm run dev    # watch mode
npm run build  # production build
```

## License

[MIT](LICENSE)
