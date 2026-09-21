import { useEffect } from "react";
import { useDocument } from "@/components/editor/session";
import { useViewport } from "@/components/editor/viewport";
import {
  locateLayer,
  type MaskModifier,
  maskModifiers,
  type Preview,
} from "@/core/document";
import { useMaskTool } from "@/features/layers/mask-tool";
import { maskNeutral } from "./layers";
import { useTool } from "./tools";

function sameModifiers(a: readonly MaskModifier[], b: readonly MaskModifier[]) {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}

/**
 * The one writer of the preview's mask overlay: a gradient being drawn, or the selected mask while
 * it is being edited and changes nothing yet, so the image itself shows the mask once an effect is applied.
 * The Overlay button shows or hides it for the selected mask, and panning hides it.
 */
export function MaskOverlaySync() {
  const document = useDocument();
  const { overlay, draft } = useMaskTool();
  const { panMode } = useViewport();
  const editing = "Canvas" in useTool().tool;
  useEffect(() => {
    function sync() {
      let next: Preview["maskOverlay"];
      const drawn = draft.getState();
      const location = locateLayer(
        document.scene.getState().layers,
        document.selection.getState().layerId,
      );
      const layer = location?.layer;
      if (drawn) {
        next = { mask: drawn, modifiers: [] };
      } else if (layer?.kind === "mask" && !panMode) {
        // A mask inside a mask has no effects of its own; its group decides.
        const group =
          location?.parent?.kind === "mask" ? location.parent : layer;
        if (
          overlay === "shown" ||
          (overlay === "auto" && editing && maskNeutral(group))
        ) {
          next = {
            mask: layer.mask,
            modifiers: maskModifiers(layer),
            layerId: layer.id,
            opacity: layer.opacity,
          };
        }
      }
      const current = document.preview.getState().maskOverlay;
      if (
        current?.mask === next?.mask &&
        current?.layerId === next?.layerId &&
        current?.opacity === next?.opacity &&
        sameModifiers(current?.modifiers ?? [], next?.modifiers ?? [])
      ) {
        return;
      }
      document.preview.setState({ maskOverlay: next });
    }
    const unsubscribe = [
      document.scene.subscribe(sync),
      document.selection.subscribe(sync),
      draft.subscribe(sync),
    ];
    sync();
    return () => {
      for (const stop of unsubscribe) {
        stop();
      }
      document.preview.setState({ maskOverlay: undefined });
    };
  }, [document, draft, overlay, editing, panMode]);
  return null;
}
