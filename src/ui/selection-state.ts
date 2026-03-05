import { Block } from "../block-resolver";

/**
 * Manages the set of selected blocks for multi-block drag operations.
 */
export class SelectionState {
  private selected: Set<number> = new Set();
  private lastSelectedIndex: number | null = null;

  /**
   * Select a single block (clears previous selection).
   */
  select(index: number): void {
    this.selected.clear();
    this.selected.add(index);
    this.lastSelectedIndex = index;
  }

  /**
   * Shift+click: extend selection to a contiguous range from last selected to index.
   */
  shiftSelect(index: number, blocks: Block[]): void {
    if (this.lastSelectedIndex === null) {
      this.select(index);
      return;
    }

    const from = Math.min(this.lastSelectedIndex, index);
    const to = Math.max(this.lastSelectedIndex, index);

    // Select all draggable blocks in the range
    for (let i = from; i <= to; i++) {
      if (blocks[i] && blocks[i].isDraggable) {
        this.selected.add(i);
      }
    }
    // Don't update lastSelectedIndex for shift-select (range anchors on original)
  }

  /**
   * Ctrl/Cmd+click: toggle a single block's selection.
   */
  ctrlSelect(index: number): void {
    if (this.selected.has(index)) {
      this.selected.delete(index);
      if (this.lastSelectedIndex === index) {
        this.lastSelectedIndex = this.selected.size > 0
          ? Math.max(...this.selected)
          : null;
      }
    } else {
      this.selected.add(index);
      this.lastSelectedIndex = index;
    }
  }

  /**
   * Clear all selection.
   */
  clear(): void {
    this.selected.clear();
    this.lastSelectedIndex = null;
  }

  /**
   * Get all selected block indices (sorted).
   */
  getSelectedIndices(): number[] {
    return [...this.selected].sort((a, b) => a - b);
  }

  /**
   * Get all selected blocks from a block list.
   */
  getSelectedBlocks(blocks: Block[]): Block[] {
    return this.getSelectedIndices()
      .map((i) => blocks[i])
      .filter((b): b is Block => b !== undefined && b.isDraggable);
  }

  /**
   * Check if a block index is selected.
   */
  isSelected(index: number): boolean {
    return this.selected.has(index);
  }

  /**
   * Check if any blocks are selected.
   */
  hasSelection(): boolean {
    return this.selected.size > 0;
  }

  /**
   * Get the count of selected blocks.
   */
  get size(): number {
    return this.selected.size;
  }
}
