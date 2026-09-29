import { useEffect } from "react";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import {
  type EditorDocument,
  findLayer,
  type Scene,
  updateLayer,
  walkLayers,
} from "@/core/document";

/** Strokes a paint layer keeps before they settle into pixels, which bounds what undo draws again. */
export const settleAt = 100;

type Renderer = ReturnType<typeof useRenderer>;

/**
 * Settles a paint layer's strokes into the pixels its raster reads back, unless undo changed the layer
 * meanwhile. The scene changes in place: what it shows is the same, and undo still reaches every stroke
 * through the history's earlier scenes and the pixels they name.
 */
export async function settlePaint(
  document: EditorDocument,
  renderer: Renderer,
  id: string,
) {
  const settled = await renderer.settle(id);
  if (!settled?.strokes.length || document.closed) {
    return;
  }
  const scene = document.scene.getState();
  const layer = findLayer(scene.layers, id);
  if (
    layer?.kind !== "paint" ||
    layer.raster !== settled.base ||
    settled.strokes.some((stroke, i) => stroke !== layer.strokes[i])
  ) {
    return;
  }
  const raster = document.resources.addPaint(settled.pixels);
  // The renderer learns first, so the scene that names the pixels finds them already drawn.
  settled.commit(raster);
  document.replace(
    updateLayer(scene, id, (item) => ({
      ...item,
      raster,
      strokes: layer.strokes.slice(settled.strokes.length),
    })),
  );
}

function crowded(scene: Scene) {
  for (const { layer } of walkLayers(scene.layers)) {
    if (layer.kind === "paint" && layer.strokes.length >= settleAt) {
      return layer.id;
    }
  }
  return undefined;
}

/**
 * Settles a paint layer, one at a time, once it has `settleAt` strokes and no gesture is open. It checks
 * after each render, when the layer's raster holds the strokes the scene has.
 */
export function PaintSettling() {
  const document = useDocument();
  const renderer = useRenderer();
  useEffect(() => {
    let running = false;
    function check() {
      if (running || document.history.status.getState().editing) {
        return;
      }
      const id = crowded(document.scene.getState());
      if (id) {
        running = true;
        settlePaint(document, renderer, id).finally(() => {
          running = false;
          check();
        });
      }
    }
    const unsubscribe = renderer.subscribe(check);
    const detach = document.history.status.subscribe(check);
    return () => {
      unsubscribe();
      detach();
    };
  }, [document, renderer]);
  return null;
}
