import { Slider } from "@roprgm/ui/slider";
import { useGpu } from "vgpu-react";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { EditorDocument, ImageLayer, MaskLayer } from "@/core/document";
import { autoWhiteBalance } from "./auto";
import {
  setIncrementalBalance,
  setWhiteBalance,
  whiteBalanceLimits,
} from "./edits";

const temperatureStops = ["#4a6fc3", "#c3b84a"];
const tintStops = ["#5ab34a", "#b34ab3"];

/** The incremental temperature and tint an image's or mask's adjustments apply. */
function incremental(
  document: EditorDocument,
  { id, adjustments }: ImageLayer | MaskLayer,
): [Parameter, Parameter] {
  const range = { min: -100, max: 100, step: 1, defaultValue: 0 };
  return [
    {
      ...range,
      id: "incrementalTemperature",
      label: "Temp",
      value: adjustments.incrementalTemperature,
      stops: temperatureStops,
      onChange: (incrementalTemperature) =>
        setIncrementalBalance(document, id, { incrementalTemperature }),
    },
    {
      ...range,
      id: "incrementalTint",
      label: "Tint",
      value: adjustments.incrementalTint,
      stops: tintStops,
      onChange: (incrementalTint) =>
        setIncrementalBalance(document, id, { incrementalTint }),
    },
  ];
}

/**
 * A layer's white balance as a temperature and a tint, with the actions it offers. A RAW photo sets its
 * own in kelvin, from its camera's As Shot; other photos and every mask shift theirs incrementally.
 * Auto neutralizes the photo, so only the image layer offers it.
 */
export function useWhiteBalance(layer: ImageLayer | MaskLayer): {
  parameters: [Parameter, Parameter];
  auto?: () => void;
  asShot?: () => void;
} {
  const document = useDocument();
  const gpu = useGpu();
  if (layer.kind === "mask") {
    return { parameters: incremental(document, layer) };
  }
  const auto = () => void autoWhiteBalance(document, gpu);
  const raw = document.resources.get(layer.source).raw;
  if (!raw) {
    return { parameters: incremental(document, layer), auto };
  }
  const balance = layer.whiteBalance ?? raw.asShot;
  const limits = whiteBalanceLimits(raw.asShot);
  return {
    parameters: [
      {
        id: "temperature",
        label: "Temperature (K)",
        value: balance.temperature,
        stops: temperatureStops,
        ...limits.temperature,
        defaultValue: raw.asShot.temperature,
        onChange: (temperature) => setWhiteBalance(document, { temperature }),
      },
      {
        id: "tint",
        label: "Tint",
        value: balance.tint,
        step: 0.1,
        stops: tintStops,
        ...limits.tint,
        defaultValue: raw.asShot.tint,
        onChange: (tint) => setWhiteBalance(document, { tint }),
      },
    ],
    auto,
    asShot: () => setWhiteBalance(document),
  };
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="pointer-events-auto cursor-pointer text-secondary hover:text-foreground"
      onClick={onClick}
    >
      {label}
    </button>
  );
}

/** The temperature and tint sliders, with As Shot and Auto beside the temperature's label. */
export function WhiteBalanceControls({
  layer,
}: {
  layer: ImageLayer | MaskLayer;
}) {
  const {
    parameters: [temperature, tint],
    asShot,
    auto,
  } = useWhiteBalance(layer);
  return (
    <>
      <div className="relative">
        <Slider {...temperature} />
        {/* The slider's label row again, its text hidden, so the actions follow the label without a row of their own. */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 py-0.5">
          <span aria-hidden className="invisible">
            {temperature.label}
          </span>
          {asShot && <Action label="As Shot" onClick={asShot} />}
          {auto && <Action label="Auto" onClick={auto} />}
        </div>
      </div>
      <Slider {...tint} />
    </>
  );
}
