import { useRef } from "react";
import { useDocument } from "@/components/editor/session";
import type { EffectLayer } from "@/core/document";
import { LayersControls, LayersSection } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import { cubeExtension } from "@/features/lut/cube";
import { AdjustPanel } from "./adjust";
import { ImageHistogram } from "./histogram";
import { createLayer, effectKinds, newLayerPlacement } from "./layers";
import { FileInput, useOpen } from "./open";

/** The layer stack with the effects the app offers; a LUT comes from a `.cube` file, opened as a drop would be. */
export function EditorLayers({ fill }: { fill?: boolean }) {
  const document = useDocument();
  const open = useOpen();
  const cube = useRef<HTMLInputElement>(null);
  function add(kind: EffectLayer["kind"]) {
    if (kind === "lut") {
      cube.current?.click();
      return;
    }
    addLayer(document, createLayer(kind), newLayerPlacement(document));
  }
  return (
    <>
      <LayersControls effects={effectKinds} onAdd={add} fill={fill} />
      <FileInput ref={cube} accept={cubeExtension} onOpen={open} />
    </>
  );
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
