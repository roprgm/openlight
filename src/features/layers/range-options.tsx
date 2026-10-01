import { IconButton } from "@roprgm/ui/icon-button";
import { Slider } from "@roprgm/ui/slider";
import { ColorInput } from "@/components/editor/color-input";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { EyedropperIcon } from "@/components/icons/eyedropper";
import type { EditorDocument, RangeMask } from "@/core/document";
import { setLayerMask } from "./edits";
import { useMaskTool } from "./mask-tool";
import { defaultLuminanceRange, defaultTolerance } from "./model";

const tones = ["#000000", "#ffffff"];

/** A range's numbers: its tones from low to high and their smoothness, or a color's tolerance. */
function rangeParameters(
  document: EditorDocument,
  id: string,
  mask: RangeMask,
): Parameter[] {
  const percent = { min: 0, max: 100 };
  if (mask.kind === "color-range") {
    return [
      {
        ...percent,
        id: "tolerance",
        label: "Tolerance",
        value: mask.tolerance,
        defaultValue: defaultTolerance,
        onChange: (tolerance) =>
          setLayerMask(document, id, { ...mask, tolerance }),
      },
    ];
  }
  const { low, high, smoothness } = defaultLuminanceRange;
  // Either end pushes the other along rather than crossing it.
  return [
    {
      ...percent,
      id: "low",
      label: "Low",
      value: mask.low,
      stops: tones,
      defaultValue: low,
      onChange: (value) =>
        setLayerMask(document, id, {
          ...mask,
          low: value,
          high: Math.max(mask.high, value),
        }),
    },
    {
      ...percent,
      id: "high",
      label: "High",
      value: mask.high,
      stops: tones,
      defaultValue: high,
      onChange: (value) =>
        setLayerMask(document, id, {
          ...mask,
          high: value,
          low: Math.min(mask.low, value),
        }),
    },
    {
      ...percent,
      id: "smoothness",
      label: "Smoothness",
      value: mask.smoothness,
      defaultValue: smoothness,
      onChange: (value) =>
        setLayerMask(document, id, { ...mask, smoothness: value }),
    },
  ];
}

/** A range mask's options in the canvas bar: its color, chosen or picked from the photo, and its numbers. */
export function RangeOptions({ id, mask }: { id: string; mask: RangeMask }) {
  const document = useDocument();
  const density = useBarDensity();
  const tool = useMaskTool();
  return (
    <>
      {mask.kind === "color-range" && (
        <span className="flex items-center gap-1">
          <ColorInput
            label="Range color"
            value={mask.color}
            onChange={(color) => setLayerMask(document, id, { ...mask, color })}
          />
          <IconButton
            label="Pick a color from the photo"
            size="icon-sm"
            className="rounded-full"
            onClick={() => tool.edit("color-range")}
          >
            <EyedropperIcon className="size-4.5 drop-shadow-(--text-shadow-default)" />
          </IconButton>
        </span>
      )}
      {rangeParameters(document, id, mask).map(({ id, ...parameter }) => (
        <Slider
          key={id}
          {...parameter}
          valueWidth={3}
          variant={barSlider(density)}
        />
      ))}
    </>
  );
}
