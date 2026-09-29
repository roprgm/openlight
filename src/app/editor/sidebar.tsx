import { useRef } from "react";
import { useDocument } from "@/components/editor/session";
import type { EffectLayer } from "@/core/document";
import { findLayer } from "@/core/document";
import { LayersControls, LayersSection } from "@/features/layers/controls";
import { addLayer, type LayerPlacement } from "@/features/layers/edits";
import { readCubeFile } from "@/features/lut/cube";
import { LutInput } from "@/features/lut/input";
import { AdjustPanel } from "./adjust";
import { ImageHistogram } from "./histogram";
import { addLut, createLayer, effectKinds } from "./layers";
import { useReportFailure } from "./open";

/** The layer stack with the effects the app offers; a new effect goes inside a selected root mask or above the selection. */
export function EditorLayers({ fill }: { fill?: boolean }) {
  const document = useDocument();
  const reportFailure = useReportFailure();
  const lutInput = useRef<HTMLInputElement>(null);
  function placement(): LayerPlacement {
    const scene = document.scene.getState();
    const selected = document.selection.getState().layerId;
    const layer = findLayer(scene.layers, selected);
    return layer?.kind === "mask" && scene.layers.includes(layer)
      ? { inside: selected }
      : { above: selected };
  }
  function add(kind: EffectLayer["kind"]) {
    if (kind === "lut") {
      lutInput.current?.click();
      return;
    }
    addLayer(document, createLayer(kind), placement());
  }
  async function addLutFile(file: File) {
    try {
      addLut(document, file, await readCubeFile(file), placement());
    } catch (error) {
      reportFailure(file.name, error);
    }
  }
  return (
    <>
      <LayersControls effects={effectKinds} onAdd={add} fill={fill} />
      <LutInput ref={lutInput} onChoose={addLutFile} />
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
