import { MenuItem, MenuSeparator } from "@roprgm/ui/menu";
import { useRef } from "react";
import { useDocument } from "@/components/editor/session";
import type { EffectLayer, MaskRange } from "@/core/document";
import { LayersControls, LayersSection } from "@/features/layers/controls";
import { addLayer } from "@/features/layers/edits";
import { cubeExtension } from "@/features/lut/cube";
import { defaultRanges } from "@/features/mask-range/model";
import { useColorPicker } from "@/features/mask-range/picker";
import { AdjustPanel } from "./adjust";
import { ImageHistogram } from "./histogram";
import {
  createLayer,
  createMask,
  effectKinds,
  newLayerPlacement,
} from "./layers";
import { FileInput, useOpen } from "./open";

/**
 * The layer stack with the effects the app offers; a LUT comes from a `.cube` file, opened as a drop
 * would be. Range masks cover the whole photo and go on top, as drawn masks do; a color range then
 * takes its color from the next click on the photo.
 */
export function EditorLayers({ fill }: { fill?: boolean }) {
  const document = useDocument();
  const open = useOpen();
  const picker = useColorPicker();
  const cube = useRef<HTMLInputElement>(null);
  function add(kind: EffectLayer["kind"]) {
    if (kind === "lut") {
      cube.current?.click();
      return;
    }
    addLayer(document, createLayer(kind), newLayerPlacement(document));
  }
  function addRange(range: MaskRange) {
    const id = addLayer(document, createMask({ kind: "full" }, "add", range));
    if (range.kind === "color") {
      picker.pick(id);
    }
  }
  return (
    <>
      <LayersControls
        effects={effectKinds}
        onAdd={add}
        addItems={
          <>
            <MenuSeparator />
            <MenuItem onClick={() => addRange(defaultRanges.luminance)}>
              Luminance Range
            </MenuItem>
            <MenuItem onClick={() => addRange(defaultRanges.color)}>
              Color Range
            </MenuItem>
          </>
        }
        fill={fill}
      />
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
