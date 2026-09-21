import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { useDocument } from "@/components/editor/session";
import { findLayer, type Gradient, type MaskLayer } from "@/core/document";

type NewMask = {
  shape: Gradient["kind"];
  parentId?: string;
  operation: "add" | "subtract";
};

/** "new" previews a just-drawn mask until Enter, Escape, or its first adjustment. */
type Overlay = "hidden" | "shown" | "new";

const GradientTool = createContext<{
  target: NewMask | null;
  overlay: Overlay;
  draw: (shape?: Gradient["kind"]) => void;
  add: (
    parentId: string,
    operation: "add" | "subtract",
    shape: Gradient["kind"],
  ) => void;
  close: () => void;
  create: (mask: Gradient, target: NewMask) => void;
  setOverlay: (overlay: Overlay) => void;
  toggleOverlay: () => void;
} | null>(null);

export function useGradientTool() {
  const tool = useContext(GradientTool);
  if (!tool) {
    throw new Error("A gradient tool provider is required.");
  }
  return tool;
}

/** Geometry edits keep the preview; effect edits end it. */
function adjusted(before: MaskLayer, after: MaskLayer) {
  return (
    before.adjustments !== after.adjustments ||
    before.toneCurve !== after.toneCurve ||
    before.children !== after.children ||
    before.opacity !== after.opacity
  );
}

export function GradientProvider({
  children,
  onCreate,
}: {
  children: ReactNode;
  onCreate: (mask: Gradient, target: NewMask) => void;
}) {
  const [target, setTarget] = useState<NewMask | null>(null);
  const [overlay, setOverlay] = useState<Overlay>("hidden");
  const close = useCallback(() => setTarget(null), []);
  const document = useDocument();
  useEffect(
    () =>
      document.selection.subscribe(() => {
        setTarget(null);
        setOverlay("hidden");
      }),
    [document],
  );
  useEffect(
    () =>
      document.scene.subscribe((scene, previous) => {
        const id = document.selection.getState().layerId;
        const before = findLayer(previous.layers, id);
        const after = findLayer(scene.layers, id);
        if (
          before?.kind === "mask" &&
          after?.kind === "mask" &&
          adjusted(before, after)
        ) {
          setOverlay("hidden");
        }
      }),
    [document],
  );
  return (
    <GradientTool
      value={{
        target,
        overlay,
        draw: (shape = "linear") => setTarget({ shape, operation: "add" }),
        add: (parentId, operation, shape) =>
          setTarget({ shape, parentId, operation }),
        close,
        create: (mask, target) => {
          onCreate(mask, target);
          setOverlay("new");
        },
        setOverlay,
        toggleOverlay: () =>
          setOverlay((overlay) => (overlay === "hidden" ? "shown" : "hidden")),
      }}
    >
      {children}
    </GradientTool>
  );
}
