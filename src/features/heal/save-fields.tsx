import { useEffect } from "react";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument } from "@/components/editor/session";
import {
  type BrushStroke,
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

/** Whether `strokes` start with every stroke of `first`, the same objects. */
function startsWith(
  strokes: readonly BrushStroke[],
  first: readonly BrushStroke[],
) {
  return (
    first.length <= strokes.length &&
    first.every((stroke, i) => stroke === strokes[i])
  );
}

/**
 * Saves the field the renderer synthesized for a Remove patch's strokes into the document. The scene
 * changes in place: the patch shows the same, and from then on undo, scene files, and other renderers
 * show it so too. A stroke added meanwhile keeps the field as the base its synthesis extends; any
 * other change to the patch, or a gesture opened meanwhile, drops it.
 */
async function saveRemoveField(
  document: EditorDocument,
  renderer: Pick<Renderer, "readField">,
  layerId: string,
  patch: RemovePatch,
) {
  const read = await renderer.readField(layerId, patch);
  if (!read || document.closed || document.history.status.getState().editing) {
    return;
  }
  const scene = document.scene.getState();
  const healing = findLayer(scene.layers, layerId);
  const current =
    healing?.kind === "heal"
      ? healing.patches.find(({ id }) => id === patch.id)
      : undefined;
  if (
    current?.mode !== "remove" ||
    !startsWith(current.strokes, patch.strokes) ||
    (current.field?.strokes ?? 0) >= patch.strokes.length
  ) {
    return;
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
              item === current ? { ...current, field } : item,
            ),
          }
        : layer,
    ),
  );
}

/**
 * Saves each Remove field once the renderer synthesizes it and no gesture is open, checking after
 * every render and when a gesture ends. A render during a save checks again after it; a patch the
 * renderer holds no field for, such as one on a hidden layer, waits for the next render. A snapshot
 * first saves what the scene lacks, so a field whose save failed tries again. Returns the stop.
 */
export function watchRemoveFields(
  document: EditorDocument,
  renderer: Pick<Renderer, "readField" | "subscribe">,
) {
  let active = true;
  let pass: Promise<void> | undefined;
  let rendered = false;
  async function save() {
    const patches = [...removePatches(document.scene.getState().layers)];
    for (const { layer, patch } of patches) {
      // A gesture stops the pass, since a readback holds renders; its end checks again.
      if (!active || document.history.status.getState().editing) {
        return;
      }
      if (!saved(patch)) {
        await saveRemoveField(document, renderer, layer.id, patch);
      }
    }
  }
  function start() {
    rendered = false;
    pass = save().finally(() => {
      pass = undefined;
      if (rendered) {
        check();
      }
    });
    return pass;
  }
  function check() {
    if (!active || document.history.status.getState().editing) {
      return;
    }
    if (pass) {
      rendered = true;
      return;
    }
    const scene = document.scene.getState();
    if ([...removePatches(scene.layers)].every(({ patch }) => saved(patch))) {
      return;
    }
    void start().catch((error) =>
      console.error("A Remove field couldn't be saved.", error),
    );
  }
  /** Saves what the scene lacks after the passes in flight, and fails with its readback. */
  async function prepare() {
    while (pass) {
      await pass.catch(() => {});
    }
    await start();
  }
  const unsubscribe = renderer.subscribe(check);
  const detach = document.history.status.subscribe(check);
  const removePreparation = document.onSnapshot(prepare);
  return () => {
    active = false;
    unsubscribe();
    detach();
    removePreparation();
  };
}

export function RemoveFieldSaving() {
  const document = useDocument();
  const renderer = useRenderer();
  useEffect(() => watchRemoveFields(document, renderer), [document, renderer]);
  return null;
}
