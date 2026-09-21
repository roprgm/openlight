import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createStore, type StoreApi } from "zustand/vanilla";
import { useDocument } from "@/components/editor/session";
import type { Gradient, Mask } from "@/core/document";

/** Where a new mask goes: inside a mask group, adding or subtracting coverage. */
export type Nesting = {
  parentId?: string;
  operation: "add" | "subtract";
};
type Pending = Nesting & { shape: Mask["kind"] };
type OverlayChoice = "auto" | "shown" | "hidden";

const MaskTool = createContext<{
  /** Chosen from a mask's Add or Subtract menu; the next mask of that shape goes there. */
  pending: Pending | null;
  add: (
    parentId: string,
    operation: Nesting["operation"],
    shape: Mask["kind"],
  ) => void;
  /** Adds the mask where `nesting` says, else where a pending choice says, else on top. */
  create: (mask: Mask, nesting?: Nesting) => void;
  /** The choice for the selected mask's overlay; auto shows it while the mask changes nothing yet. */
  overlay: OverlayChoice;
  showOverlay: (shown: boolean) => void;
  /** A gradient being drawn, not yet in the scene, tinted like a mask. */
  draft: StoreApi<Gradient | null>;
  /** Enters editing with the tool of a shape, or leaves it: the layer stays selected, its guides go. */
  edit: (shape?: Mask["kind"]) => void;
} | null>(null);

export function useMaskTool() {
  const tool = useContext(MaskTool);
  if (!tool) {
    throw new Error("A mask tool provider is required.");
  }
  return tool;
}

export function MaskToolProvider({
  children,
  onCreate,
  onTool,
  onDone,
}: {
  children: ReactNode;
  onCreate: (mask: Mask, nesting: Nesting) => void;
  /** Activates the tool that draws the shape. */
  onTool?: (shape: Mask["kind"]) => void;
  /** Returns to the tool without a mask canvas. */
  onDone?: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [overlay, setOverlay] = useState<OverlayChoice>("auto");
  const draft = useMemo(() => createStore<Gradient | null>(() => null), []);
  const document = useDocument();
  // A nesting and an overlay choice belong to the selection that made them.
  useEffect(
    () =>
      document.selection.subscribe(() => {
        setPending(null);
        setOverlay("auto");
      }),
    [document],
  );
  return (
    <MaskTool
      value={{
        pending,
        add: (parentId, operation, shape) => {
          setPending({ parentId, operation, shape });
          onTool?.(shape);
        },
        create: (mask, nesting) => {
          const chosen: Nesting =
            pending?.shape === mask.kind ? pending : { operation: "add" };
          setPending(null);
          onCreate(mask, nesting ?? chosen);
        },
        overlay,
        showOverlay: (shown) => setOverlay(shown ? "shown" : "hidden"),
        draft,
        edit: (shape) => {
          setPending(null);
          // Keys after entering or leaving belong to the canvas, not to the row or tab that asked.
          if (window.document.activeElement instanceof HTMLElement) {
            window.document.activeElement.blur();
          }
          if (shape) {
            onTool?.(shape);
          } else {
            onDone?.();
          }
        },
      }}
    >
      {children}
    </MaskTool>
  );
}
