import { Slider } from "@roprgm/ui/slider";
import type { ReactNode } from "react";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import type { Adjustments, EditorDocument } from "@/core/document";
import { setAdjustments } from "./edits";
import { adjustmentLimits, defaultAdjustments } from "./model";

const stops: Partial<Record<keyof Adjustments, string[]>> = {
  incrementalTemperature: ["#4a6fc3", "#c3b84a"],
  incrementalTint: ["#5ab34a", "#b34ab3"],
  saturation: [
    "#7b7d85",
    "#868686 50%",
    "#7fa066 68%",
    "#b8a75c 84%",
    "#c25a48",
  ],
};

export const tone = [
  ["exposure", "Exposure"],
  ["contrast", "Contrast"],
  ["highlights", "Highlights"],
  ["shadows", "Shadows"],
  ["whites", "Whites"],
  ["blacks", "Blacks"],
] as const;
export const color = [
  ["incrementalTemperature", "Temp"],
  ["incrementalTint", "Tint"],
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
    stops: name === "vibrance" ? stops.saturation : stops[name],
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

/** The temperature slot replaces the incremental temperature and tint sliders. */
export function AdjustmentControls({
  id,
  adjustments,
  temperature,
}: {
  id: string;
  adjustments: Readonly<Adjustments>;
  temperature?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      <AdjustmentSliders id={id} adjustments={adjustments} controls={tone} />
      {temperature}
      <AdjustmentSliders
        id={id}
        adjustments={adjustments}
        controls={temperature ? color.slice(2) : color}
      />
    </section>
  );
}
