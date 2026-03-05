import { EditorView } from "@codemirror/view";
import { Block } from "../block-resolver";

/**
 * Manages a single reusable grip handle element.
 * The handle is repositioned (not recreated) when the hovered block changes.
 */
export class GripHandle {
  readonly el: HTMLElement;
  private currentBlock: Block | null = null;
  private visible = false;

  constructor(private view: EditorView) {
    this.el = document.createElement("div");
    this.el.className = "block-dnd-handle";
    this.el.setAttribute("aria-label", "Drag to reorder");
    this.el.setAttribute("draggable", "false");

    // Six-dot grip icon built with DOM API (no innerHTML)
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("fill", "currentColor");

    const positions = [
      [5, 3], [11, 3],
      [5, 8], [11, 8],
      [5, 13], [11, 13],
    ];
    for (const [cx, cy] of positions) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", String(cx));
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "1.5");
      svg.appendChild(circle);
    }

    this.el.appendChild(svg);
    this.view.dom.appendChild(this.el);
  }

  /**
   * Show the handle aligned to the given block.
   */
  show(block: Block): void {
    if (!block.isDraggable) {
      this.hide();
      return;
    }

    this.currentBlock = block;

    // Get the coordinates of the first line of the block
    const line = this.view.state.doc.line(block.fromLine);
    const coords = this.view.coordsAtPos(line.from);
    if (!coords) {
      this.hide();
      return;
    }

    const editorRect = this.view.dom.getBoundingClientRect();
    const handleHeight = 24;

    // Vertically center the handle with the text line
    const lineHeight = coords.bottom - coords.top;
    const top = coords.top - editorRect.top + this.view.dom.scrollTop
      + (lineHeight - handleHeight) / 2;

    // Horizontally: place just to the left of the gutter (before the chevron)
    const gutterEl = this.view.dom.querySelector(".cm-gutters") as HTMLElement | null;
    let left: number;
    if (gutterEl) {
      const gutterRect = gutterEl.getBoundingClientRect();
      // Position so the handle's right edge touches the gutter's left edge (with 2px gap)
      left = gutterRect.left - editorRect.left - 26;
    } else {
      const contentRect = this.view.contentDOM.getBoundingClientRect();
      left = contentRect.left - editorRect.left - 26;
    }

    this.el.style.top = `${top}px`;
    this.el.style.left = `${Math.max(0, left)}px`;

    if (!this.visible) {
      this.el.classList.add("is-visible");
      this.visible = true;
    }
  }

  /**
   * Hide the handle.
   */
  hide(): void {
    if (this.visible) {
      this.el.classList.remove("is-visible");
      this.visible = false;
      this.currentBlock = null;
    }
  }

  /**
   * Get the currently shown block.
   */
  getBlock(): Block | null {
    return this.currentBlock;
  }

  /**
   * Check if the handle is currently visible.
   */
  isVisible(): boolean {
    return this.visible;
  }

  /**
   * Set grabbing cursor state.
   */
  setGrabbing(grabbing: boolean): void {
    if (grabbing) {
      this.el.classList.add("is-grabbing");
    } else {
      this.el.classList.remove("is-grabbing");
    }
  }

  /**
   * Clean up the handle element.
   */
  destroy(): void {
    this.el.remove();
  }
}
