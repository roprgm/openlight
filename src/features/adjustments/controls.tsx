import { Slider } from "@roprgm/ui/slider";
import type { ReactNode } from "react";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { Adjustments, EditorDocument } from "@/core/document";
import { setAdjustments } from "./edits";
import { adjustmentLimits, defaultAdjustments } from "./model";

const saturationStops = [
  "#7b7d85",
  "#868686 50%",
  "#7fa066 68%",
  "#b8a75c 84%",
  "#c25a48",
];

export const tone = [
  ["exposure", "Exposure"],
  ["contrast", "Contrast"],
  ["highlights", "Highlights"],
  ["shadows", "Shadows"],
  ["whites", "Whites"],
  ["blacks", "Blacks"],
] as const;
/** White balance, which leads the color group, has its own controls. */
export const color = [
  ["vibrance", "Vibrance"],
  ["saturation", "Saturation"],
] as const;
type Control = (typeof tone)[number] | (typeof color)[number];

export function adjustmentParameters(
  document: EditorDocument,
  id: string,
  adjustments: Readonly<Adjustments>,
  controls: readonly Control[],
): Parameter[] {
  return controls.map(([name, label]) => ({
    id: name,
    label,
    value: adjustments[name],
    step: name === "exposure" ? 0.01 : 1,
    stops:
      name === "vibrance" || name === "saturation"
        ? saturationStops
        : undefined,
    min: -adjustmentLimits[name],
    max: adjustmentLimits[name],
    defaultValue: defaultAdjustments[name],
    onChange: (value) => setAdjustments(document, { [name]: value }, id),
  }));
}

function AdjustmentSliders({
  id,
  adjustments,
  controls,
}: {
  id: string;
  adjustments: Readonly<Adjustments>;
  controls: readonly Control[];
}) {
  const document = useDocument();
  return adjustmentParameters(document, id, adjustments, controls).map(
    ({ id, ...parameter }) => <Slider key={id} {...parameter} />,
  );
}

/** Tone, then the white balance's controls, then color. */
export function AdjustmentControls({
  id,
  adjustments,
  whiteBalance,
}: {
  id: string;
  adjustments: Readonly<Adjustments>;
  whiteBalance: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      <AdjustmentSliders id={id} adjustments={adjustments} controls={tone} />
      {whiteBalance}
      <AdjustmentSliders id={id} adjustments={adjustments} controls={color} />
    </section>
  );
}
