import { useEffect, useRef } from "react";
import { findLayer, type Layer, type Scene } from "@/core/document";
import { useDocument } from "./session";

/**
 * Keeps a tool on a layer it accepts. Opening without one, or with `fresh`, creates a layer, when
 * `create` is given, that leaves with the tool unless anything happened after its creation; selecting
 * any other layer leaves the tool. Returns a lookup of the selected layer at call time, for pointer
 * handlers that run before a render.
 */
export function useToolLayer<L extends Layer>({
  accepts,
  create,
  leave,
  fresh = false,
}: {
  accepts: (layer: Layer) => layer is L;
  create?: () => void;
  leave: () => void;
  fresh?: boolean;
}) {
  const document = useDocument();
  const before = useRef<Scene | undefined>(undefined);
  const canCreate = create !== undefined;
  function selected() {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    return layer && accepts(layer) ? layer : undefined;
  }
  useEffect(() => {
    if (create && (fresh || !selected())) {
      before.current = document.scene.getState();
      create();
    }
  }, [canCreate, fresh]);
  useEffect(() => {
    const unsubscribe = document.selection.subscribe(() => {
      if (!selected()) {
        leave();
      }
    });
    return () => {
      unsubscribe();
      if (before.current) {
        document.history.drop(before.current);
      }
    };
  }, []);
  return selected;
}
