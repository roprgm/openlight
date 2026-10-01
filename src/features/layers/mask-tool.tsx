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
import type { Gradient, Mask, MaskLayer } from "@/core/document";
import { blurActive } from "@/lib/dom";
import { defaultLuminanceRange } from "./model";

/** Where a new mask goes: inside a mask group, combined with its coverage, or else on top. */
export type Nesting = {
  parentId?: string;
  operation: MaskLayer["operation"];
};
/** The masks a tool on the canvas draws or picks; a luminance range needs none. */
type DrawnShape = Exclude<Mask["kind"], "luminance-range">;
type Pending = Nesting & { shape: DrawnShape };
type OverlayChoice = "auto" | "shown" | "hidden";

const MaskTool = createContext<{
  /** Chosen from a menu; the next mask of that shape goes there. */
  pending: Pending | null;
  /**
   * Starts a mask of `shape` where `nesting` says, or on top: a luminance range at once, any other
   * once its tool draws or picks it.
   */
  add: (shape: Mask["kind"], nesting?: Nesting) => void;
  /** Adds the mask where `nesting` says, else where a pending choice says, else on top. */
  create: (mask: Mask, nesting?: Nesting) => void;
  /**
   * The choice for the selected mask's overlay; auto shows it while the mask changes nothing yet.
   * It holds across selections, so a mask chosen next shows or hides it the same way.
   */
  overlay: OverlayChoice;
  showOverlay: (shown: boolean) => void;
  /** A gradient being drawn, not yet in the scene, tinted like a mask. */
  draft: StoreApi<Gradient | null>;
  /**
   * Enters editing with the tool of a shape, or leaves it: the layer stays selected, its guides go.
   * A luminance range has no tool, so it leaves too.
   */
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
  /** Activates the tool that draws or picks the shape. */
  onTool?: (shape: DrawnShape) => void;
  /** Returns to the tool without a mask canvas. */
  onDone?: () => void;
}) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [overlay, setOverlay] = useState<OverlayChoice>("auto");
  const draft = useMemo(() => createStore<Gradient | null>(() => null), []);
  const document = useDocument();
  // A nesting belongs to the selection that chose it.
  useEffect(
    () => document.selection.subscribe(() => setPending(null)),
    [document],
  );
  function edit(shape?: Mask["kind"]) {
    setPending(null);
    // Keys after entering or leaving belong to the canvas, not to the row or tab that asked.
    blurActive();
    if (shape && shape !== "luminance-range") {
      onTool?.(shape);
    } else {
      onDone?.();
    }
  }
  return (
    <MaskTool
      value={{
        pending,
        add: (shape, nesting = { operation: "add" }) => {
          if (shape === "luminance-range") {
            edit();
            onCreate(defaultLuminanceRange, nesting);
            return;
          }
          setPending({ ...nesting, shape });
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
        edit,
      }}
    >
      {children}
    </MaskTool>
  );
}
