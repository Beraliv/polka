import { batch, createSignal, onCleanup } from 'solid-js';
import { SelectionManager } from './selection-manager.ts';

/**
 * Solid binding for SelectionManager: mirrors its selection into a signal so
 * components re-render on change, and unsubscribes when the owning component
 * unmounts. Methods are bound here so they can be passed straight to event
 * props like `onDragStart={selectionManager.dragHandle}`.
 */
export function createSelectionManager() {
  const manager = new SelectionManager();
  const [activeSelection, setActiveSelection] = createSignal(manager.selection);
  // The manager already caches its Range per selection change, so this only
  // has to re-read it whenever the selection signal fires.
  const [activeRange, setActiveRange] = createSignal(manager.range);

  const unsubscribe = manager.subscribe((selection) => {
    batch(() => {
      setActiveSelection(selection);
      setActiveRange(manager.range);
    });
  });
  onCleanup(unsubscribe);

  return {
    activeRange,
    activeSelection,
    copyActiveSelection: manager.copyActiveSelection.bind(manager),
    dismissSelection: manager.dismissSelection.bind(manager),
    dragHandle: manager.dragHandle.bind(manager),
    searchActiveSelectionInWeb: manager.searchActiveSelectionInWeb.bind(manager),
    selectByPointerDrag: manager.selectByPointerDrag.bind(manager),
    selectWordAtPoint: manager.selectWordAtPoint.bind(manager),
    selectWordOnDoubleClick: manager.selectWordOnDoubleClick.bind(manager),
  };
}
