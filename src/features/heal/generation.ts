import type { Gpu } from "vgpu";
import type { useRenderer } from "@/components/editor/pipeline";
import type { EditorDocument } from "@/core/document";
import { createPixelSource } from "@/core/image";
import { setAiResult, settleAiResult } from "./edits";
import type { MiganRuntime } from "./migan";
import { findHealPatch } from "./model";

type Renderer = ReturnType<typeof useRenderer>;

/** Generates AI Remove results from the composite each patch receives and stores them as document resources. */
export function createAiGeneration(
  document: EditorDocument,
  renderer: Renderer,
  gpu: Gpu,
  migan: MiganRuntime,
) {
  /** Settling amends the edit that made the patch stale; otherwise the result joins the open stroke. */
  async function generate(
    layerId: string,
    patchId: string,
    signal: AbortSignal,
    settle = false,
  ) {
    const scene = document.scene.getState();
    const patch = findHealPatch(scene, layerId, patchId);
    if (patch?.algorithm !== "ai") return;
    await renderer.update(scene, patchId, false);
    signal.throwIfAborted();
    const image = renderer.inputImage(patchId);
    if (!image) throw Error("Heal input is unavailable.");
    const dimensions = document.resources.get(scene.layers[0].source).image
      .size;
    const generated = await migan.generate(
      image,
      dimensions,
      patch.stroke,
      signal,
    );
    signal.throwIfAborted();
    // A stroke edited meanwhile, or moved, regenerates after it commits instead of taking this result.
    const live = findHealPatch(document.scene.getState(), layerId, patchId);
    if (live?.algorithm !== "ai" || (!settle && live.stale)) return;
    const result = {
      source: document.resources.add(
        new File([], "AI Remove result"),
        createPixelSource(gpu, generated.result),
      ),
      origin: generated.origin,
      extent: generated.extent,
    };
    if (settle) settleAiResult(document, layerId, patchId, result);
    else setAiResult(document, layerId, patchId, result);
  }
  /** Regenerates the AI patches from one patch onward, in replay order. */
  async function regenerateFrom(
    layerId: string,
    patchId: string,
    signal: AbortSignal,
  ) {
    const layer = document.scene
      .getState()
      .layers.find((layer) => layer.id === layerId);
    if (layer?.kind !== "heal") return;
    const index = layer.patches.findIndex((patch) => patch.id === patchId);
    if (index < 0) return;
    const affected = layer.patches
      .slice(index)
      .filter((patch) => patch.algorithm === "ai")
      .map((patch) => patch.id);
    for (const id of affected) await generate(layerId, id, signal);
  }
  return { generate, regenerateFrom };
}
