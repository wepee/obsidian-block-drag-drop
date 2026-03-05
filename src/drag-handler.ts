import { EditorView } from "@codemirror/view";
import { Block, resolveBlocks, blockAtPos, findDropTarget } from "./block-resolver";
import { buildMoveTransaction } from "./drop-engine";
import { GripHandle } from "./ui/grip-handle";
import { DropIndicator } from "./ui/drop-indicator";
import { Ghost } from "./ui/ghost";
import { SelectionState } from "./ui/selection-state";

export type DragStatus = "idle" | "pending" | "dragging";

export interface DragHandlerOptions {
  dragThreshold: number;
  enableMultiSelect: boolean;
}

const DEFAULT_OPTIONS: DragHandlerOptions = {
  dragThreshold: 5,
  enableMultiSelect: true,
};

/**
 * Manages the full drag-and-drop lifecycle:
 * mousedown → pending → dragging → mouseup
 */
export class DragHandler {
  private status: DragStatus = "idle";
  private blocks: Block[] = [];
  private startX = 0;
  private startY = 0;
  private sourceBlocks: Block[] = [];
  private currentDropTarget: { insertPos: number; beforeIndex: number } | null = null;
  private rafId: number | null = null;

  readonly handle: GripHandle;
  readonly indicator: DropIndicator;
  readonly ghost: Ghost;
  readonly selection: SelectionState;

  private options: DragHandlerOptions;

  // Bound event handlers for cleanup
  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: (e: MouseEvent) => void;
  private boundHandleMouseDown: (e: MouseEvent) => void;
  private boundEditorMouseMove: (e: MouseEvent) => void;
  private boundEditorMouseLeave: (e: MouseEvent) => void;
  private boundEditorClick: (e: MouseEvent) => void;

  // Decoration callback — set by cm-plugin to apply/clear decorations
  onDecorationChange: ((dimmedBlocks: Block[], selectedIndices: Set<number>) => void) | null = null;

  constructor(
    private view: EditorView,
    options?: Partial<DragHandlerOptions>
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.handle = new GripHandle(view);
    this.indicator = new DropIndicator(view);
    this.ghost = new Ghost(view);
    this.selection = new SelectionState();

    // Build initial block list
    this.blocks = resolveBlocks(view.state);

    // Bind event handlers
    this.boundMouseMove = this.onDocumentMouseMove.bind(this);
    this.boundMouseUp = this.onDocumentMouseUp.bind(this);
    this.boundHandleMouseDown = this.onHandleMouseDown.bind(this);
    this.boundEditorMouseMove = this.onEditorMouseMove.bind(this);
    this.boundEditorMouseLeave = this.onEditorMouseLeave.bind(this);
    this.boundEditorClick = this.onEditorClick.bind(this);

    // Attach listeners
    this.handle.el.addEventListener("mousedown", this.boundHandleMouseDown);
    this.view.dom.addEventListener("mousemove", this.boundEditorMouseMove);
    this.view.dom.addEventListener("mouseleave", this.boundEditorMouseLeave);
    this.view.dom.addEventListener("mousedown", this.boundEditorClick);
  }

  /**
   * Update the block list (call on docChanged).
   */
  rebuildBlocks(): void {
    this.blocks = resolveBlocks(this.view.state);
  }

  /**
   * Get the current block list.
   */
  getBlocks(): Block[] {
    return this.blocks;
  }

  /**
   * Get current drag status.
   */
  getStatus(): DragStatus {
    return this.status;
  }

  // --- Editor mouse events ---

  private onEditorMouseMove(e: MouseEvent): void {
    if (this.status !== "idle") return;

    // Determine which block the cursor is over
    const pos = this.view.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos === null) {
      this.handle.hide();
      return;
    }

    const block = blockAtPos(this.blocks, pos);
    if (block && block.isDraggable) {
      this.handle.show(block);
    } else {
      this.handle.hide();
    }
  }

  private onEditorMouseLeave(_e: MouseEvent): void {
    if (this.status === "idle") {
      // Delay hide to allow mouse to reach the handle
      setTimeout(() => {
        if (this.status === "idle" && !this.handle.el.matches(":hover")) {
          this.handle.hide();
        }
      }, 100);
    }
  }

  private onEditorClick(e: MouseEvent): void {
    // If clicking in the editor content (not on the handle), clear selection
    if (
      this.status === "idle" &&
      !this.handle.el.contains(e.target as Node) &&
      this.selection.hasSelection()
    ) {
      this.selection.clear();
      this.updateDecorations();
    }
  }

  // --- Handle mousedown ---

  private onHandleMouseDown(e: MouseEvent): void {
    e.preventDefault();
    e.stopPropagation();

    const block = this.handle.getBlock();
    if (!block) return;

    // Handle selection modifiers
    if (this.options.enableMultiSelect && e.shiftKey) {
      this.selection.shiftSelect(block.index, this.blocks);
      this.updateDecorations();
    } else if (this.options.enableMultiSelect && (e.ctrlKey || e.metaKey)) {
      this.selection.ctrlSelect(block.index);
      this.updateDecorations();
    } else {
      // If the block is already selected (part of a multi-selection), keep selection
      if (!this.selection.isSelected(block.index)) {
        this.selection.select(block.index);
        this.updateDecorations();
      }
    }

    // Enter pending state
    this.status = "pending";
    this.startX = e.clientX;
    this.startY = e.clientY;
    this.sourceBlocks = this.selection.getSelectedBlocks(this.blocks);

    if (this.sourceBlocks.length === 0) {
      this.sourceBlocks = [block];
    }

    // Listen for document-level mouse events
    document.addEventListener("mousemove", this.boundMouseMove);
    document.addEventListener("mouseup", this.boundMouseUp);
  }

  // --- Document-level mouse events during drag ---

  private onDocumentMouseMove(e: MouseEvent): void {
    if (this.status === "pending") {
      // Check threshold
      const dx = e.clientX - this.startX;
      const dy = e.clientY - this.startY;
      if (Math.sqrt(dx * dx + dy * dy) < this.options.dragThreshold) {
        return;
      }

      // Enter dragging state
      this.status = "dragging";
      this.view.dom.classList.add("is-dragging");
      this.handle.setGrabbing(true);

      // Create ghost
      this.ghost.create(this.sourceBlocks);

      // Dim source blocks
      this.updateDecorations();
    }

    if (this.status === "dragging") {
      // Update ghost position
      if (this.rafId !== null) {
        cancelAnimationFrame(this.rafId);
      }
      this.rafId = requestAnimationFrame(() => {
        this.ghost.updatePosition(e.clientX, e.clientY);
        this.updateDropIndicator(e.clientX, e.clientY);
        this.rafId = null;
      });
    }
  }

  private onDocumentMouseUp(e: MouseEvent): void {
    // Clean up document-level listeners
    document.removeEventListener("mousemove", this.boundMouseMove);
    document.removeEventListener("mouseup", this.boundMouseUp);

    if (this.status === "dragging") {
      // Execute the move
      this.executeMove();
    }

    // Reset state
    this.cleanup();
  }

  // --- Drop indicator ---

  private updateDropIndicator(clientX: number, clientY: number): void {
    const pos = this.view.posAtCoords({ x: clientX, y: clientY });
    if (pos === null) {
      this.indicator.hide();
      this.currentDropTarget = null;
      return;
    }

    const target = findDropTarget(this.blocks, pos);
    if (!target) {
      this.indicator.hide();
      this.currentDropTarget = null;
      return;
    }

    // Don't show indicator inside the source blocks
    const isInsideSource = this.sourceBlocks.some(
      (b) => target.insertPos >= b.from && target.insertPos <= b.to
    );
    if (isInsideSource) {
      this.indicator.hide();
      this.currentDropTarget = null;
      return;
    }

    this.currentDropTarget = target;

    // Find the blocks above and below the drop gap to center the indicator
    const blockAbove = target.beforeIndex > 0 ? this.blocks[target.beforeIndex - 1] : null;
    const blockBelow = target.beforeIndex < this.blocks.length ? this.blocks[target.beforeIndex] : null;
    this.indicator.showBetween(blockAbove, blockBelow, target.insertPos);
  }

  // --- Execute move ---

  private executeMove(): void {
    if (!this.currentDropTarget || this.sourceBlocks.length === 0) return;

    const targetPos = this.currentDropTarget.insertPos;
    const sorted = [...this.sourceBlocks].sort((a, b) => a.from - b.from);

    // Compute where the inserted text will start in the new document.
    // Deletions before the target shift it left.
    let deletedBefore = 0;
    for (const block of sorted) {
      if (block.to <= targetPos) {
        deletedBefore += block.to - block.from;
      } else if (block.from < targetPos) {
        deletedBefore += targetPos - block.from;
      }
    }
    const newInsertPos = targetPos - deletedBefore;

    // Compute how many content lines are being moved
    const doc = this.view.state.doc;
    let totalLines = 0;
    for (const block of sorted) {
      const s = doc.lineAt(block.from).number;
      const e = doc.lineAt(Math.max(block.from, block.to - 1)).number;
      totalLines += e - s + 1;
    }

    const transaction = buildMoveTransaction(
      this.view.state,
      this.sourceBlocks,
      targetPos
    );

    if (transaction) {
      this.view.dispatch(transaction);
      this.rebuildBlocks();

      // Animate after CM6 re-renders
      const linesToAnimate = totalLines;
      const insertPos = newInsertPos;
      requestAnimationFrame(() => {
        this.animateLandedLines(insertPos, linesToAnimate);
      });
    }
  }

  /**
   * Apply landing animation directly to DOM .cm-line elements.
   */
  private animateLandedLines(insertPos: number, lineCount: number): void {
    const newDoc = this.view.state.doc;
    const clampedPos = Math.min(insertPos, newDoc.length);
    if (clampedPos < 0) return;

    const startLine = newDoc.lineAt(clampedPos).number;
    const endLine = Math.min(startLine + lineCount - 1, newDoc.lines);

    const cmLines = this.view.contentDOM.querySelectorAll<HTMLElement>(".cm-line");
    for (const cmLine of cmLines) {
      const pos = this.view.posAtDOM(cmLine);
      if (pos === null) continue;

      const lineNum = newDoc.lineAt(pos).number;
      if (lineNum >= startLine && lineNum <= endLine) {
        // Force animation restart by removing then re-adding
        cmLine.classList.remove("block-dnd-landed");
        void cmLine.offsetWidth; // force reflow
        cmLine.classList.add("block-dnd-landed");
        cmLine.addEventListener(
          "animationend",
          () => cmLine.classList.remove("block-dnd-landed"),
          { once: true }
        );
      }
    }
  }

  // --- Cleanup ---

  private cleanup(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }

    this.status = "idle";
    this.sourceBlocks = [];
    this.currentDropTarget = null;

    this.view.dom.classList.remove("is-dragging");
    this.handle.setGrabbing(false);
    this.ghost.destroy();
    this.indicator.hide();

    // Clear dimmed state but keep selection
    this.updateDecorations();
  }

  // --- Decorations ---

  private updateDecorations(): void {
    if (this.onDecorationChange) {
      const dimmed = this.status === "dragging" ? this.sourceBlocks : [];
      const selectedIndices = new Set(this.selection.getSelectedIndices());
      this.onDecorationChange(dimmed, selectedIndices);
    }
  }

  // --- Destroy ---

  destroy(): void {
    document.removeEventListener("mousemove", this.boundMouseMove);
    document.removeEventListener("mouseup", this.boundMouseUp);
    this.handle.el.removeEventListener("mousedown", this.boundHandleMouseDown);
    this.view.dom.removeEventListener("mousemove", this.boundEditorMouseMove);
    this.view.dom.removeEventListener("mouseleave", this.boundEditorMouseLeave);
    this.view.dom.removeEventListener("mousedown", this.boundEditorClick);

    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
    }

    this.handle.destroy();
    this.indicator.destroy();
    this.ghost.destroy();
  }
}
