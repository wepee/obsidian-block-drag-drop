import { EditorView } from "@codemirror/view";
import { Block } from "../block-resolver";

/**
 * Manages a single drop indicator line element.
 * Shows a horizontal line centered in the gap between two blocks.
 */
export class DropIndicator {
  readonly el: HTMLElement;
  private visible = false;

  constructor(private view: EditorView) {
    this.el = document.createElement("div");
    this.el.className = "block-dnd-indicator";
    this.view.dom.appendChild(this.el);
  }

  /**
   * Show the indicator centered between two blocks.
   * Uses the bottom of the block above and the top of the block below
   * to find the visual midpoint of the gap.
   */
  showBetween(blockAbove: Block | null, blockBelow: Block | null, fallbackPos: number): void {
    const editorRect = this.view.dom.getBoundingClientRect();
    const contentRect = this.view.contentDOM.getBoundingClientRect();

    let topY: number;

    if (blockAbove && blockBelow) {
      // Get bottom of block above (end of its last line)
      const aboveEndPos = Math.max(blockAbove.from, blockAbove.to - 1);
      const aboveCoords = this.view.coordsAtPos(aboveEndPos);
      // Get top of block below (start of its first line)
      const belowCoords = this.view.coordsAtPos(blockBelow.from);

      if (aboveCoords && belowCoords) {
        // Center between the bottom of above and top of below
        const gapTop = aboveCoords.bottom;
        const gapBottom = belowCoords.top;
        topY = (gapTop + gapBottom) / 2 - editorRect.top + this.view.dom.scrollTop;
      } else {
        return this.showAtFallback(fallbackPos, editorRect, contentRect);
      }
    } else if (blockBelow) {
      // Dropping before the first block — place just above it
      const belowCoords = this.view.coordsAtPos(blockBelow.from);
      if (belowCoords) {
        topY = belowCoords.top - editorRect.top + this.view.dom.scrollTop - 2;
      } else {
        return this.showAtFallback(fallbackPos, editorRect, contentRect);
      }
    } else if (blockAbove) {
      // Dropping after the last block — place just below it
      const aboveEndPos = Math.max(blockAbove.from, blockAbove.to - 1);
      const aboveCoords = this.view.coordsAtPos(aboveEndPos);
      if (aboveCoords) {
        topY = aboveCoords.bottom - editorRect.top + this.view.dom.scrollTop + 2;
      } else {
        return this.showAtFallback(fallbackPos, editorRect, contentRect);
      }
    } else {
      return this.showAtFallback(fallbackPos, editorRect, contentRect);
    }

    const left = contentRect.left - editorRect.left;
    const width = contentRect.width;

    this.el.style.top = `${topY - 1}px`; // -1 to center the 2px line
    this.el.style.left = `${left}px`;
    this.el.style.width = `${width}px`;

    if (!this.visible) {
      this.el.classList.add("is-visible");
      this.visible = true;
    }
  }

  /**
   * Fallback: position at a raw document position.
   */
  private showAtFallback(pos: number, editorRect: DOMRect, contentRect: DOMRect): void {
    const coords = this.view.coordsAtPos(pos);
    if (!coords) {
      this.hide();
      return;
    }

    const top = coords.top - editorRect.top + this.view.dom.scrollTop - 1;
    const left = contentRect.left - editorRect.left;
    const width = contentRect.width;

    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
    this.el.style.width = `${width}px`;

    if (!this.visible) {
      this.el.classList.add("is-visible");
      this.visible = true;
    }
  }

  /**
   * Hide the indicator.
   */
  hide(): void {
    if (this.visible) {
      this.el.classList.remove("is-visible");
      this.visible = false;
    }
  }

  /**
   * Check if visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Clean up.
   */
  destroy(): void {
    this.el.remove();
  }
}
