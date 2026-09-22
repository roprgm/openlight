import { useEffect } from "react";
import { findLayer, type Layer } from "@/core/document";
import { useDocument } from "./session";

/**
 * Keeps a tool on a layer it accepts. Opening without one, or with `fresh`, creates a layer that leaves
 * with the tool unless anything happened after its creation; selecting any other layer leaves the tool.
 * Returns a lookup of the selected layer at call time, for pointer handlers that run before a render.
 */
export function useToolLayer<L extends Layer>({
  accepts,
  create,
  leave,
  fresh = false,
}: {
  accepts: (layer: Layer) => layer is L;
  create: () => void;
  leave: () => void;
  fresh?: boolean;
}) {
  const document = useDocument();
  function selected() {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    return layer && accepts(layer) ? layer : undefined;
  }
  useEffect(() => {
    const before = fresh || !selected() ? document.scene.getState() : undefined;
    if (before) {
      create();
    }
    const unsubscribe = document.selection.subscribe(() => {
      if (!selected()) {
        leave();
      }
    });
    return () => {
      unsubscribe();
      if (before) {
        document.history.drop(before);
      }
    };
  }, []);
  return selected;
}
