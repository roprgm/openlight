import { useEffect } from "react";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import {
  type EditorDocument,
  findLayer,
  paintingOf,
  type Scene,
  updateLayer,
  walkLayers,
} from "@/core/document";

/** Strokes a painting keeps before they settle into pixels, which bounds what undo draws again. */
export const settleAt = 100;

type Renderer = ReturnType<typeof useRenderer>;

/**
 * Settles a paint layer's or brush mask's strokes into the pixels its raster reads back, unless undo
 * changed the layer meanwhile. The scene changes in place: what it shows is the same, and undo still
 * reaches every stroke through the history's earlier scenes and the pixels they name.
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
  const painting = layer && paintingOf(layer);
  if (
    painting?.raster !== settled.base ||
    settled.strokes.some((stroke, i) => stroke !== painting?.strokes[i])
  ) {
    return;
  }
  const raster = document.resources.addPaint(settled.pixels);
  const count = settled.strokes.length;
  // The renderer learns first, so the scene that names the pixels finds them already drawn.
  settled.commit(raster);
  document.replace(
    updateLayer(scene, id, (item) => {
      if (item.kind === "paint") {
        return { ...item, raster, strokes: item.strokes.slice(count) };
      }
      if (item.kind === "mask" && item.mask.kind === "brush") {
        const strokes = item.mask.strokes.slice(count);
        return { ...item, mask: { ...item.mask, raster, strokes } };
      }
      return item;
    }),
  );
}

function crowded(scene: Scene) {
  for (const { layer } of walkLayers(scene.layers)) {
    if ((paintingOf(layer)?.strokes.length ?? 0) >= settleAt) {
      return layer.id;
    }
  }
  return undefined;
}

/**
 * Settles a painting, one at a time, once it has `settleAt` strokes and no gesture is open. It checks
 * after each render, when the painting's raster holds the strokes the scene has.
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
