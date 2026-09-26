import { Slider } from "@roprgm/ui/slider";
import { useCallback } from "react";
import { useStore } from "zustand";
import { effectKinds } from "@/app/editor/layers";
import { PanelBody, PanelHeader } from "@/components/editor/panel";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import {
  adjustmentTarget,
  findLayer,
  type Layer,
  type ToneCurve,
} from "@/core/document";
import { AdjustmentControls } from "@/features/adjustments/controls";
import { setExposure } from "@/features/adjustments/edits";
import { ColorMixerControls } from "@/features/color-mixer/controls";
import { DetailsControls } from "@/features/details/controls";
import { FillControls } from "@/features/fill/controls";
import { HealControls } from "@/features/heal/controls";
import { Histogram } from "@/features/histogram";
import { OverlayToggle } from "@/features/layers/overlay-toggle";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import { VignetteControls } from "@/features/vignette/controls";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";

/** Names what the controls edit, not the layer, whose name the stack already shows. */
function panelTitle(layer: Layer) {
  if (layer.kind === "image") return "Adjustments";
  if (layer.kind === "mask") return "Mask adjustments";
  return effectKinds.find((entry) => entry.kind === layer.kind)?.label;
}

const curveHistogramColors = ["#a3a3a3"] as const;

function CurveInputHistogram({ id }: { id: string }) {
  const renderer = useRenderer();
  const image = useCallback(() => renderer.inputImage(id), [renderer, id]);
  return (
    <Histogram
      image={image}
      subscribe={renderer.subscribe}
      colors={curveHistogramColors}
      working
      fillOpacity={0.65}
      aria-label="curve input histogram"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-25"
    />
  );
}

function LayerCurve({ id, toneCurve }: { id: string; toneCurve: ToneCurve }) {
  const document = useDocument();
  return (
    <div className="px-(--padding) pb-(--padding)">
      <ToneCurves
        points={toneCurve}
        onChange={(points) => setToneCurve(document, points, id)}
      >
        <CurveInputHistogram id={id} />
      </ToneCurves>
    </div>
  );
}

function SelectedControls({ layer }: { layer: Layer }) {
  const document = useDocument();
  switch (layer.kind) {
    case "details":
      return <DetailsControls id={layer.id} details={layer.details} />;
    case "image":
      return (
        <>
          <AdjustmentControls
            id={layer.id}
            adjustments={layer.adjustments}
            temperature={
              document.resources.get(layer.source).raw && (
                <WhiteBalanceControls />
              )
            }
          />
          <LayerCurve id={layer.id} toneCurve={layer.toneCurve} />
        </>
      );
    case "color-mixer":
      return <ColorMixerControls id={layer.id} mixer={layer.colorMixer} />;
    case "vignette":
      return <VignetteControls id={layer.id} vignette={layer.vignette} />;
    case "fill":
      return <FillControls id={layer.id} fill={layer.fill} />;
    case "heal":
      return <HealControls id={layer.id} patches={layer.patches} />;
    case "exposure":
      return (
        <section className="p-(--padding)">
          <Slider
            label="Exposure"
            value={layer.exposure}
            min={-5}
            max={5}
            step={0.01}
            defaultValue={0}
            onChange={(value) => setExposure(document, layer.id, value)}
          />
        </section>
      );
    case "mask":
      return (
        <>
          <AdjustmentControls id={layer.id} adjustments={layer.adjustments} />
          <LayerCurve id={layer.id} toneCurve={layer.toneCurve} />
        </>
      );
  }
}

export function AdjustPanel() {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  const selected = useStore(document.selection, (state) => state.layerId);
  const target = useScene(
    (scene) => adjustmentTarget(scene.layers, selected) ?? scene.layers[0],
  );
  const mask = useScene(
    (scene) => findLayer(scene.layers, selected)?.kind === "mask",
  );
  return (
    <PanelBody
      header={
        <PanelHeader title={panelTitle(target) ?? target.name}>
          {mask && <OverlayToggle />}
        </PanelHeader>
      }
    >
      <div {...gesture}>
        <SelectedControls layer={target} />
      </div>
    </PanelBody>
  );
}
