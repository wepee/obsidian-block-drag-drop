import { EditorState, TransactionSpec, ChangeSpec } from "@codemirror/state";
import { Block } from "./block-resolver";

/**
 * Build a CM6 transaction that moves the given source blocks to a target position.
 * Returns null if the move would be a no-op.
 *
 * All source blocks are deleted from their original positions and inserted
 * (in their original document order) at the target position. This is done
 * as a single atomic transaction so Ctrl+Z undoes the entire move.
 */
export function buildMoveTransaction(
  state: EditorState,
  sourceBlocks: Block[],
  targetPos: number
): TransactionSpec | null {
  if (sourceBlocks.length === 0) return null;

  // Sort source blocks by document position
  const sorted = [...sourceBlocks].sort((a, b) => a.from - b.from);

  // Check if this is a no-op: target is inside or immediately adjacent to source
  if (isNoOp(sorted, targetPos)) {
    return null;
  }

  // Extract text for each source block
  const doc = state.doc;
  const texts: string[] = [];
  for (const block of sorted) {
    const text = doc.sliceString(block.from, block.to);
    texts.push(text);
  }

  // Combine texts
  let combinedText = texts.join("");

  // Ensure the combined text ends with exactly one newline
  combinedText = combinedText.replace(/\n*$/, "\n");

  // If inserting at position 0 or at a position that doesn't start on a new line,
  // we may need to adjust
  if (targetPos > 0) {
    const charBefore = doc.sliceString(targetPos - 1, targetPos);
    if (charBefore !== "\n") {
      combinedText = "\n" + combinedText;
    }
  }

  // If inserting at a position where the next char is not a newline and not end-of-doc,
  // ensure separation
  if (targetPos < doc.length) {
    const charAfter = doc.sliceString(targetPos, targetPos + 1);
    if (charAfter !== "\n" && combinedText.endsWith("\n")) {
      // Already ends with newline, good
    } else if (charAfter !== "\n") {
      combinedText = combinedText + "\n";
    }
  }

  // Build changes array: deletions + insertion
  // We need to be careful about position mapping. CM6 handles this when
  // changes are provided as an array sorted by position.
  const changes: ChangeSpec[] = [];

  // First, figure out where the insertion goes relative to the deletions.
  // We build all changes in document order.

  // Collect all operations (deletions and insertion) and sort by position
  type Op = { pos: number; type: "delete"; from: number; to: number }
    | { pos: number; type: "insert"; at: number; text: string };

  const ops: Op[] = [];

  for (const block of sorted) {
    ops.push({ pos: block.from, type: "delete", from: block.from, to: block.to });
  }
  ops.push({ pos: targetPos, type: "insert", at: targetPos, text: combinedText });

  // Sort by position (deletions before insertions at the same position)
  ops.sort((a, b) => {
    if (a.pos !== b.pos) return a.pos - b.pos;
    // At the same position, deletions come first
    return a.type === "delete" ? -1 : 1;
  });

  // Convert to CM6 ChangeSpec array
  for (const op of ops) {
    if (op.type === "delete") {
      changes.push({ from: op.from, to: op.to });
    } else {
      changes.push({ from: op.at, insert: op.text });
    }
  }

  return {
    changes,
    // Scroll the insertion point into view
    scrollIntoView: true,
  };
}

/**
 * Check if moving the given blocks to targetPos would be a no-op.
 * A move is a no-op if the target is within or immediately adjacent
 * to the contiguous range formed by the source blocks.
 */
function isNoOp(sortedBlocks: Block[], targetPos: number): boolean {
  if (sortedBlocks.length === 0) return true;

  const first = sortedBlocks[0];
  const last = sortedBlocks[sortedBlocks.length - 1];

  // Target is inside the source range
  if (targetPos >= first.from && targetPos <= last.to) {
    return true;
  }

  // For contiguous blocks, check if target is immediately before or after
  if (isContiguous(sortedBlocks)) {
    // Target is right before the first block
    if (targetPos === first.from) return true;
    // Target is right after the last block
    if (targetPos === last.to) return true;
  }

  return false;
}

/**
 * Check if the given sorted blocks form a contiguous range
 * (no gaps between them).
 */
function isContiguous(sortedBlocks: Block[]): boolean {
  for (let i = 1; i < sortedBlocks.length; i++) {
    if (sortedBlocks[i].from !== sortedBlocks[i - 1].to) {
      return false;
    }
  }
  return true;
}

/**
 * Build a transaction to move a block up by one position.
 * Used by the Alt+Shift+Up keyboard shortcut.
 */
export function buildMoveUpTransaction(
  state: EditorState,
  blocks: Block[],
  blockIndex: number
): TransactionSpec | null {
  if (blockIndex <= 0) return null;

  // Find the previous draggable block
  let prevIndex = blockIndex - 1;
  while (prevIndex >= 0 && !blocks[prevIndex].isDraggable) {
    prevIndex--;
  }
  if (prevIndex < 0) return null;

  const sourceBlock = blocks[blockIndex];
  if (!sourceBlock.isDraggable) return null;

  return buildMoveTransaction(state, [sourceBlock], blocks[prevIndex].from);
}

/**
 * Build a transaction to move a block down by one position.
 * Used by the Alt+Shift+Down keyboard shortcut.
 */
export function buildMoveDownTransaction(
  state: EditorState,
  blocks: Block[],
  blockIndex: number
): TransactionSpec | null {
  if (blockIndex >= blocks.length - 1) return null;

  // Find the next draggable block
  let nextIndex = blockIndex + 1;
  while (nextIndex < blocks.length && !blocks[nextIndex].isDraggable) {
    nextIndex++;
  }
  if (nextIndex >= blocks.length) return null;

  const sourceBlock = blocks[blockIndex];
  if (!sourceBlock.isDraggable) return null;

  // Insert after the next block
  return buildMoveTransaction(state, [sourceBlock], blocks[nextIndex].to);
}
