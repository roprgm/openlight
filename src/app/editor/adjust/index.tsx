import { Button } from "@roprgm/ui/button";
import { Slider } from "@roprgm/ui/slider";
import { Spinner } from "@roprgm/ui/spinner";
import { type ReactNode, useCallback, useState } from "react";
import { useStore } from "zustand";
import { effectKinds } from "@/app/editor/layers";
import { DockChips, DockControls } from "@/components/editor/dock";
import { PanelBody, PanelHeader } from "@/components/editor/panel";
import type { Parameter } from "@/components/editor/parameter";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import {
  adjustmentTarget,
  type EditorDocument,
  findLayer,
  type ImageLayer,
  type Layer,
  type MaskLayer,
  type ToneCurve,
} from "@/core/document";
import {
  AdjustmentControls,
  adjustmentParameters,
  color,
  tone,
} from "@/features/adjustments/controls";
import { setExposure } from "@/features/adjustments/edits";
import {
  ColorMixerControls,
  mixerParameters,
} from "@/features/color-mixer/controls";
import { channels, type MixerChannel } from "@/features/color-mixer/model";
import {
  DetailsControls,
  detailsParameters,
} from "@/features/details/controls";
import { FillControls } from "@/features/fill/controls";
import { GrainControls, grainParameters } from "@/features/grain/controls";
import { HealControls } from "@/features/heal/controls";
import { HealModeButtons } from "@/features/heal/mode-buttons";
import { Histogram } from "@/features/histogram";
import { setLayer } from "@/features/layers/edits";
import { OverlayToggle } from "@/features/layers/overlay-toggle";
import { LutCurves } from "@/features/lut/curves";
import {
  NoiseReductionControls,
  useNoiseReduction,
} from "@/features/noise-reduction/controls";
import { PaintControls } from "@/features/paint/controls";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { ToneCurves } from "@/features/tone-curves/tone-curves";
import {
  VignetteControls,
  vignetteParameters,
} from "@/features/vignette/controls";
import {
  useWhiteBalance,
  WhiteBalanceControls,
} from "@/features/white-balance/controls";
import { useEditGesture } from "@/hooks/use-edit-gesture";

type Kind<K extends Layer["kind"]> = Extract<Layer, { kind: K }>;

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

function LayerCurve({
  id,
  toneCurve,
  fill,
}: {
  id: string;
  toneCurve: ToneCurve;
  fill?: boolean;
}) {
  const document = useDocument();
  return (
    <ToneCurves
      points={toneCurve}
      fill={fill}
      onChange={(points) => setToneCurve(document, points, id)}
    >
      <CurveInputHistogram id={id} />
    </ToneCurves>
  );
}

function exposureParameter(
  document: EditorDocument,
  layer: Kind<"exposure">,
): Parameter {
  return {
    id: "exposure",
    label: "Exposure",
    value: layer.exposure,
    min: -5,
    max: 5,
    step: 0.01,
    defaultValue: 0,
    onChange: (value) => setExposure(document, layer.id, value),
  };
}

/** A LUT's strength is its layer's opacity. */
function intensityParameter(
  document: EditorDocument,
  layer: Kind<"lut">,
): Parameter {
  return {
    id: "intensity",
    label: "Intensity",
    value: layer.opacity * 100,
    min: 0,
    max: 100,
    defaultValue: 100,
    onChange: (value) => setLayer(document, layer.id, { opacity: value / 100 }),
  };
}

function SelectedControls({ layer }: { layer: Layer }) {
  const document = useDocument();
  switch (layer.kind) {
    case "details":
      return <DetailsControls id={layer.id} details={layer.details} />;
    case "image":
    case "mask":
      return (
        <>
          <AdjustmentControls
            id={layer.id}
            adjustments={layer.adjustments}
            whiteBalance={<WhiteBalanceControls layer={layer} />}
          >
            {layer.kind === "image" && <NoiseReductionControls layer={layer} />}
          </AdjustmentControls>
          <div className="px-3.5 pb-3.5">
            <LayerCurve id={layer.id} toneCurve={layer.toneCurve} />
          </div>
        </>
      );
    case "color-mixer":
      return <ColorMixerControls id={layer.id} mixer={layer.colorMixer} />;
    case "vignette":
      return <VignetteControls id={layer.id} vignette={layer.vignette} />;
    case "grain":
      return <GrainControls id={layer.id} grain={layer.grain} />;
    case "fill":
      return <FillControls id={layer.id} fill={layer.fill} />;
    case "lut": {
      const { id, ...intensity } = intensityParameter(document, layer);
      return (
        <section className="flex flex-col gap-3.5 p-3.5">
          <Slider {...intensity} />
          <LutCurves lut={layer.lut} opacity={layer.opacity} />
        </section>
      );
    }
    case "heal":
      return <HealControls id={layer.id} patches={layer.patches} />;
    case "paint":
      return <PaintControls layer={layer} />;
    case "exposure": {
      const { id, ...parameter } = exposureParameter(document, layer);
      return (
        <section className="p-3.5">
          <Slider {...parameter} />
        </section>
      );
    }
  }
}

/** The layer the controls edit, the selection or the mask a selected child mask belongs to, and whether a mask is selected. */
function useAdjustmentTarget() {
  const document = useDocument();
  const selected = useStore(document.selection, (state) => state.layerId);
  const target = useScene(
    (scene) => adjustmentTarget(scene.layers, selected) ?? scene.layers[0],
  );
  const mask = useScene(
    (scene) => findLayer(scene.layers, selected)?.kind === "mask",
  );
  return { target, mask };
}

export function AdjustPanel() {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  const { target, mask } = useAdjustmentTarget();
  return (
    <PanelBody
      header={
        <PanelHeader title={panelTitle(target) ?? target.name}>
          {mask && <OverlayToggle />}
          {target.kind === "heal" && <HealModeButtons />}
        </PanelHeader>
      }
    >
      <div {...gesture}>
        <SelectedControls layer={target} />
      </div>
    </PanelBody>
  );
}

const groups = [
  ["light", "Light"],
  ["color", "Color"],
  ["curve", "Curve"],
] as const;
type Group = (typeof groups)[number][0];

/** An image or mask in the dock: its tone, color, or curve, one group at a time. */
function AdjustmentDials({
  layer,
  group,
  onGroupChange,
  action,
}: {
  layer: ImageLayer | MaskLayer;
  group: Group;
  onGroupChange: (group: Group) => void;
  action: ReactNode;
}) {
  const document = useDocument();
  const whiteBalance = useWhiteBalance(layer);
  const noiseReduction = useNoiseReduction(layer);
  const header = (
    <DockChips
      label="Adjustment group"
      items={groups}
      value={group}
      onChange={onGroupChange}
    />
  );
  if (group === "curve") {
    return (
      <DockControls
        tall
        header={header}
        action={
          <>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Reset curve"
              onClick={() => setToneCurve(document, defaultCurve, layer.id)}
            >
              Reset
            </Button>
            {action}
          </>
        }
      >
        <div className="mx-auto min-h-0 w-full max-w-72 flex-1 px-3.5">
          <LayerCurve id={layer.id} toneCurve={layer.toneCurve} fill />
        </div>
      </DockControls>
    );
  }
  const adjustments = (controls: Parameters<typeof adjustmentParameters>[3]) =>
    adjustmentParameters(document, layer.id, layer.adjustments, controls);
  if (group === "color") {
    return (
      <DockControls
        header={header}
        action={
          <>
            {whiteBalance.auto && (
              <Button
                variant="ghost"
                size="sm"
                aria-label="Auto white balance"
                onClick={whiteBalance.auto}
              >
                Auto
              </Button>
            )}
            {action}
          </>
        }
        parameters={[...whiteBalance.parameters, ...adjustments(color)]}
      />
    );
  }
  // A RAW photo's noise reduction follows its tone, with a spinner while the first reduction runs.
  return (
    <DockControls
      header={header}
      action={
        <>
          {noiseReduction?.reducing && (
            <Spinner aria-label="Reducing noise" className="size-3" />
          )}
          {action}
        </>
      }
      parameters={[...adjustments(tone), ...(noiseReduction?.parameters ?? [])]}
    />
  );
}

function MixerDials({ layer }: { layer: Kind<"color-mixer"> }) {
  const document = useDocument();
  const [channel, setChannel] = useState<MixerChannel>("hue");
  return (
    <DockControls
      header={
        <DockChips
          label="Color Mixer adjustment"
          items={channels.map(({ id, label }) => [id, label] as const)}
          value={channel}
          onChange={setChannel}
        />
      }
      parameters={mixerParameters(
        document,
        layer.id,
        layer.colorMixer,
        channel,
      )}
    />
  );
}

function DockTitle({ layer }: { layer: Layer }) {
  return <h2 className="font-medium text-foreground">{panelTitle(layer)}</h2>;
}

function SelectedDials({
  layer,
  mask,
  group,
  onGroupChange,
}: {
  layer: Layer;
  mask: boolean;
  group: Group;
  onGroupChange: (group: Group) => void;
}) {
  const document = useDocument();
  switch (layer.kind) {
    case "image":
    case "mask":
      return (
        <AdjustmentDials
          layer={layer}
          group={group}
          onGroupChange={onGroupChange}
          action={mask && <OverlayToggle />}
        />
      );
    case "color-mixer":
      return <MixerDials layer={layer} />;
    case "details":
      return (
        <DockControls
          header={<DockTitle layer={layer} />}
          parameters={detailsParameters(document, layer.id, layer.details)}
        />
      );
    case "vignette":
      return (
        <DockControls
          header={<DockTitle layer={layer} />}
          parameters={vignetteParameters(document, layer.id, layer.vignette)}
        />
      );
    case "grain":
      return (
        <DockControls
          header={<DockTitle layer={layer} />}
          parameters={grainParameters(document, layer.id, layer.grain)}
        />
      );
    case "exposure":
      return (
        <DockControls
          header={<DockTitle layer={layer} />}
          parameters={[exposureParameter(document, layer)]}
        />
      );
    case "fill":
      return (
        <DockControls header={<DockTitle layer={layer} />}>
          <FillControls id={layer.id} fill={layer.fill} />
        </DockControls>
      );
    case "lut":
      return (
        <DockControls
          header={<DockTitle layer={layer} />}
          parameters={[intensityParameter(document, layer)]}
        />
      );
    case "heal":
      return (
        <DockControls header={<DockTitle layer={layer} />}>
          <div className="max-h-48 overflow-y-auto">
            <HealControls id={layer.id} patches={layer.patches} />
          </div>
        </DockControls>
      );
    case "paint":
      return (
        <DockControls header={<DockTitle layer={layer} />}>
          <PaintControls layer={layer} />
        </DockControls>
      );
  }
}

/** The selected layer's controls in the dock: dials where the sidebar has sliders. */
export function AdjustDock() {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  const { target, mask } = useAdjustmentTarget();
  // The group stays as the selection moves between images and masks.
  const [group, setGroup] = useState<Group>("light");
  return (
    <div className="flex min-h-0 flex-1 flex-col" {...gesture}>
      <SelectedDials
        layer={target}
        mask={mask}
        group={group}
        onGroupChange={setGroup}
      />
    </div>
  );
}
