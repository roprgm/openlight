import type { ReactNode } from "react";
import { EditorPanel } from "@/components/editor/panel";
import { useDocument } from "@/components/editor/session";
import type { EffectLayer } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import { ImageHistogram } from "./histogram";
import { createLayer } from "./layers";

/** Histogram above, the mode's controls in the middle, the layer stack below once there is a document. */
export function EditorSidebar({
  children,
  inert,
}: {
  children: ReactNode;
  inert?: boolean;
}) {
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
  return (
    <EditorPanel
      inert={inert}
      header={<ImageHistogram />}
      footer={!inert && <LayersControls onAdd={add} />}
    >
      {children}
    </EditorPanel>
  );
}
