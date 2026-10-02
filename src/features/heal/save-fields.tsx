import { useEffect } from "react";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import {
  type EditorDocument,
  findLayer,
  type RemovePatch,
  removePatches,
  updateLayer,
} from "@/core/document";

type Renderer = ReturnType<typeof useRenderer>;

/** Whether a patch's saved field covers every stroke it has. */
function saved(patch: RemovePatch) {
  return patch.field?.strokes === patch.strokes.length;
}

/**
 * Saves the field the renderer synthesized for a Remove patch's strokes into the document, unless the
 * patch changed meanwhile, and returns whether it did. The scene changes in place: the patch shows the
 * same, and from then on undo, scene files, and other renderers show it so too.
 */
export async function saveRemoveField(
  document: EditorDocument,
  renderer: Pick<Renderer, "readField">,
  layerId: string,
  patch: RemovePatch,
) {
  const read = await renderer.readField(layerId, patch);
  if (!read || document.closed) {
    return false;
  }
  const scene = document.scene.getState();
  const healing = findLayer(scene.layers, layerId);
  if (healing?.kind !== "heal" || !healing.patches.includes(patch)) {
    return false;
  }
  const field = {
    texels: document.resources.addField(read.texels),
    strokes: patch.strokes.length,
    ...read.lattice,
  };
  document.replace(
    updateLayer(scene, layerId, (layer) =>
      layer.kind === "heal"
        ? {
            ...layer,
            patches: layer.patches.map((item) =>
              item === patch ? { ...patch, field } : item,
            ),
          }
        : layer,
    ),
  );
  return true;
}

/**
 * Saves each Remove field once the renderer synthesizes it, checking after every render. A render
 * during a save checks again after it; a patch the renderer holds no field for, such as one on a
 * hidden layer, waits for the next render. Returns the stop.
 */
export function watchRemoveFields(
  document: EditorDocument,
  renderer: Pick<Renderer, "readField" | "subscribe">,
) {
  let active = true;
  let running = false;
  let rendered = false;
  async function save() {
    running = true;
    rendered = false;
    try {
      const unsaved = [...removePatches(document.scene.getState().layers)];
      for (const { layer, patch } of unsaved) {
        if (active && !saved(patch)) {
          await saveRemoveField(document, renderer, layer.id, patch);
        }
      }
    } finally {
      running = false;
    }
  }
  function check() {
    if (!active) {
      return;
    }
    if (running) {
      rendered = true;
      return;
    }
    const scene = document.scene.getState();
    if ([...removePatches(scene.layers)].every(({ patch }) => saved(patch))) {
      return;
    }
    void save().then(() => rendered && check());
  }
  const unsubscribe = renderer.subscribe(check);
  return () => {
    active = false;
    unsubscribe();
  };
}

export function RemoveFieldSaving() {
  const document = useDocument();
  const renderer = useRenderer();
  useEffect(() => watchRemoveFields(document, renderer), [document, renderer]);
  return null;
}
