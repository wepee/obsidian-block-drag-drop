import { EditorView } from "@codemirror/view";
import { Block } from "../block-resolver";

/**
 * Manages the ghost element that follows the cursor during drag.
 */
export class Ghost {
  private el: HTMLElement | null = null;
  private offsetX = 8;
  private offsetY = 8;

  constructor(private view: EditorView) {}

  /**
   * Create the ghost element from the given blocks' rendered DOM.
   */
  create(blocks: Block[]): void {
    this.destroy();

    if (blocks.length === 0) return;

    const container = document.createElement("div");
    container.className = "block-dnd-ghost";

    // Clone the DOM of the first block
    const firstBlock = blocks[0];
    const clonedContent = this.cloneBlockDOM(firstBlock);
    if (clonedContent) {
      container.appendChild(clonedContent);
    } else {
      // Fallback: show text content
      const textEl = document.createElement("div");
      textEl.className = "block-dnd-ghost-text";
      const text = this.view.state.doc.sliceString(firstBlock.from, Math.min(firstBlock.to, firstBlock.from + 200));
      textEl.textContent = text.trim();
      container.appendChild(textEl);
    }

    // If multiple blocks, show a "+N" badge
    if (blocks.length > 1) {
      const badge = document.createElement("div");
      badge.className = "block-dnd-ghost-badge";
      badge.textContent = `+${blocks.length - 1}`;
      container.appendChild(badge);
    }

    // Set the width to match editor content
    const scrollerRect = this.view.scrollDOM.getBoundingClientRect();
    container.style.width = `${Math.min(scrollerRect.width, 600)}px`;

    document.body.appendChild(container);
    this.el = container;
  }

  /**
   * Clone the rendered DOM for a block.
   */
  private cloneBlockDOM(block: Block): HTMLElement | null {
    try {
      // Find the DOM element(s) for this block's line range
      const line = this.view.state.doc.line(block.fromLine);
      const lineBlock = this.view.lineBlockAt(line.from);
      if (!lineBlock) return null;

      // Find the DOM node for this line
      const domAtPos = this.view.domAtPos(line.from);
      if (!domAtPos || !domAtPos.node) return null;

      // Get the closest block-level element
      let el: HTMLElement | null = null;
      if (domAtPos.node instanceof HTMLElement) {
        el = domAtPos.node;
      } else if (domAtPos.node.parentElement) {
        el = domAtPos.node.parentElement;
      }

      // Walk up to find a CM line element
      while (el && !el.classList.contains("cm-line") && !el.classList.contains("cm-content")) {
        el = el.parentElement;
      }

      if (el && el.classList.contains("cm-line")) {
        const clone = el.cloneNode(true) as HTMLElement;
        // Strip any editor-specific interactive elements
        clone.querySelectorAll("[contenteditable]").forEach((e) =>
          e.removeAttribute("contenteditable")
        );
        return clone;
      }

      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update the ghost position to follow the cursor.
   */
  updatePosition(x: number, y: number): void {
    if (!this.el) return;
    this.el.style.left = `${x + this.offsetX}px`;
    this.el.style.top = `${y + this.offsetY}px`;
  }

  /**
   * Remove the ghost element.
   */
  destroy(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }
}
