import {
  ViewPlugin,
  ViewUpdate,
  EditorView,
  Decoration,
  DecorationSet,
} from "@codemirror/view";
import { StateField, StateEffect, Range } from "@codemirror/state";
import { Block } from "./block-resolver";
import { DragHandler, DragHandlerOptions } from "./drag-handler";

/**
 * State effect to update block decorations (dimmed source, selected blocks).
 */
const setBlockDecorations = StateEffect.define<DecorationSet>();

/**
 * State field that holds the current block decorations.
 */
export const blockDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setBlockDecorations)) {
        return effect.value;
      }
    }
    if (tr.docChanged) {
      return decos.map(tr.changes);
    }
    return decos;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/**
 * Build line decorations for dimmed and selected blocks.
 */
function buildDecorations(
  view: EditorView,
  blocks: Block[],
  dimmedBlocks: Block[],
  selectedIndices: Set<number>
): DecorationSet {
  const decorations: Range<Decoration>[] = [];
  const doc = view.state.doc;

  for (const block of blocks) {
    const isDimmed = dimmedBlocks.some((b) => b.index === block.index);
    const isSelected = selectedIndices.has(block.index);

    if (!isDimmed && !isSelected) continue;

    const startLine = doc.line(block.fromLine);
    const endLine = doc.line(block.toLine);

    for (let lineNum = startLine.number; lineNum <= endLine.number; lineNum++) {
      const line = doc.line(lineNum);

      if (isDimmed) {
        decorations.push(
          Decoration.line({ class: "block-dnd-source-dimmed" }).range(line.from)
        );
      } else if (isSelected) {
        decorations.push(
          Decoration.line({ class: "block-dnd-selected" }).range(line.from)
        );
      }
    }
  }

  decorations.sort((a, b) => a.from - b.from);
  return Decoration.set(decorations);
}

/**
 * Create the CM6 ViewPlugin for block drag-and-drop.
 */
export function createBlockDndPlugin(options?: Partial<DragHandlerOptions>) {
  return ViewPlugin.fromClass(
    class {
      dragHandler: DragHandler;

      constructor(view: EditorView) {
        this.dragHandler = new DragHandler(view, options);

        this.dragHandler.onDecorationChange = (dimmedBlocks, selectedIndices) => {
          const decos = buildDecorations(
            view,
            this.dragHandler.getBlocks(),
            dimmedBlocks,
            selectedIndices
          );
          view.dispatch({
            effects: setBlockDecorations.of(decos),
          });
        };
      }

      update(update: ViewUpdate): void {
        if (update.docChanged) {
          this.dragHandler.rebuildBlocks();
        }
      }

      destroy(): void {
        this.dragHandler.destroy();
      }
    }
  );
}
