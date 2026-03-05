import { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { SyntaxNode } from "@lezer/common";

export interface Block {
  index: number;
  type: string;
  from: number;
  to: number;
  fromLine: number;
  toLine: number;
  isDraggable: boolean;
}

/**
 * Map Lezer Markdown node type names to our block type strings.
 * CM6's Markdown parser uses these node names for top-level constructs.
 */
const NODE_TYPE_MAP: Record<string, string> = {
  Paragraph: "paragraph",
  ATXHeading1: "heading",
  ATXHeading2: "heading",
  ATXHeading3: "heading",
  ATXHeading4: "heading",
  ATXHeading5: "heading",
  ATXHeading6: "heading",
  SetextHeading1: "heading",
  SetextHeading2: "heading",
  BulletList: "list",
  OrderedList: "list",
  FencedCode: "code-block",
  Blockquote: "blockquote",
  Table: "table",
  HorizontalRule: "thematic-break",
  HTMLBlock: "html-block",
  LinkReference: "link-reference",
  CommentBlock: "comment",
};

/**
 * Check if a node represents a list item (for individual item extraction).
 */
function isListItem(name: string): boolean {
  return name === "ListItem";
}

/**
 * Check if a node is frontmatter.
 */
function isFrontmatter(node: SyntaxNode): boolean {
  // Obsidian's CM6 marks frontmatter with the node type "FrontMatter" or similar
  const name = node.type.name;
  return (
    name === "FrontMatter" ||
    name === "Frontmatter" ||
    name === "YAMLFrontMatter" ||
    name === "HorizontalRule" && node.from === 0
  );
}

/**
 * Resolve the document into a flat list of top-level blocks.
 *
 * Strategy:
 * 1. Walk top-level children of the syntax tree.
 * 2. For lists, walk each ListItem as a separate block.
 * 3. Extend each block's `to` to include trailing blank lines
 *    (up to the start of the next block).
 */
export function resolveBlocks(state: EditorState): Block[] {
  const tree = syntaxTree(state);
  const doc = state.doc;
  const blocks: Block[] = [];

  // Collect raw block positions from top-level nodes
  const rawPositions: { from: number; to: number; type: string; isDraggable: boolean }[] = [];

  const topNode = tree.topNode;
  if (!topNode) return [];

  let child = topNode.firstChild;
  while (child) {
    const name = child.type.name;

    // Check for frontmatter at position 0
    if (child.from === 0 && isFrontmatter(child)) {
      rawPositions.push({
        from: child.from,
        to: child.to,
        type: "frontmatter",
        isDraggable: false,
      });
      child = child.nextSibling;
      continue;
    }

    // For lists, extract individual list items as separate blocks
    if (name === "BulletList" || name === "OrderedList") {
      let listItem = child.firstChild;
      while (listItem) {
        if (isListItem(listItem.type.name)) {
          rawPositions.push({
            from: listItem.from,
            to: listItem.to,
            type: "list-item",
            isDraggable: true,
          });
        }
        listItem = listItem.nextSibling;
      }
      child = child.nextSibling;
      continue;
    }

    // Map known node types
    const blockType = NODE_TYPE_MAP[name];
    if (blockType) {
      rawPositions.push({
        from: child.from,
        to: child.to,
        type: blockType,
        isDraggable: true,
      });
    } else {
      // Unknown top-level node — treat as a generic block
      rawPositions.push({
        from: child.from,
        to: child.to,
        type: "unknown",
        isDraggable: true,
      });
    }

    child = child.nextSibling;
  }

  // If the tree gave us nothing, treat the whole doc as one block
  if (rawPositions.length === 0 && doc.length > 0) {
    rawPositions.push({
      from: 0,
      to: doc.length,
      type: "paragraph",
      isDraggable: true,
    });
  }

  // Extend each block's `to` to include trailing whitespace up to the next block
  for (let i = 0; i < rawPositions.length; i++) {
    const raw = rawPositions[i];
    const nextFrom = i + 1 < rawPositions.length ? rawPositions[i + 1].from : doc.length;

    // The block's effective end includes trailing newlines up to the next block
    const effectiveTo = nextFrom;

    const fromLine = doc.lineAt(raw.from).number;
    const toLine = doc.lineAt(Math.max(raw.from, effectiveTo - 1)).number;

    blocks.push({
      index: i,
      type: raw.type,
      from: raw.from,
      to: effectiveTo,
      fromLine,
      toLine,
      isDraggable: raw.isDraggable,
    });
  }

  // Ensure the last block extends to the end of the document
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (last.to < doc.length) {
      last.to = doc.length;
      last.toLine = doc.lineAt(doc.length).number;
    }
  }

  return blocks;
}

/**
 * Find the block that contains a given document position.
 */
export function blockAtPos(blocks: Block[], pos: number): Block | null {
  for (const block of blocks) {
    if (pos >= block.from && pos < block.to) {
      return block;
    }
  }
  // Check last block (pos === doc.length)
  if (blocks.length > 0) {
    const last = blocks[blocks.length - 1];
    if (pos >= last.from && pos <= last.to) {
      return last;
    }
  }
  return null;
}

/**
 * Find the nearest inter-block gap for a drop target.
 * Returns the character position where an insertion should happen,
 * and the index of the block that would follow the insertion.
 */
export function findDropTarget(
  blocks: Block[],
  pos: number
): { insertPos: number; beforeIndex: number } | null {
  if (blocks.length === 0) return null;

  const draggableBlocks = blocks.filter((b) => b.isDraggable);
  if (draggableBlocks.length === 0) return null;

  // Before the first draggable block
  const firstDraggable = draggableBlocks[0];
  if (pos <= firstDraggable.from) {
    return { insertPos: firstDraggable.from, beforeIndex: firstDraggable.index };
  }

  // Between blocks — find nearest gap
  for (let i = 0; i < draggableBlocks.length - 1; i++) {
    const current = draggableBlocks[i];
    const next = draggableBlocks[i + 1];
    const gapMid = (current.to + next.from) / 2;
    if (pos < gapMid) {
      return { insertPos: next.from, beforeIndex: next.index };
    }
  }

  // After the last block
  const lastDraggable = draggableBlocks[draggableBlocks.length - 1];
  return { insertPos: lastDraggable.to, beforeIndex: blocks.length };
}
