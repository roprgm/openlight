import { useDocument } from "@/components/editor/session";
import type { EffectLayer } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls, LayersSection } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import { AdjustPanel } from "./adjust";
import { ImageHistogram } from "./histogram";
import { createLayer, effectKinds } from "./layers";

/** The layer stack with the effects the app offers; a new effect goes inside a selected root mask or above the selection. */
export function EditorLayers({ fill }: { fill?: boolean }) {
  const document = useDocument();
  function add(kind: EffectLayer["kind"]) {
    const scene = document.scene.getState();
    const selected = document.selection.getState().layerId;
    const layer = findLayer(scene.layers, selected);
    const placement =
      layer?.kind === "mask" && scene.layers.includes(layer)
        ? { inside: selected }
        : { above: selected };
    addLayer(document, createLayer(kind), placement);
  }
  return <LayersControls effects={effectKinds} onAdd={add} fill={fill} />;
}

/** The editing sidebar's sections, top to bottom; reorder them here. */
export function EditorSidebar() {
  return (
    <>
      <ImageHistogram placement="panel" />
      <EditorLayers />
      <AdjustPanel />
    </>
  );
}

/** Before a document opens, the sidebar shows the same sections with an empty layer stack. */
export function PlaceholderSidebar() {
  return (
    <>
      <ImageHistogram placement="panel" />
      <LayersSection />
      <AdjustPanel />
    </>
  );
}
