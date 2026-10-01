import type { Parameter } from "@/components/editor/parameter";
import type { EditorDocument, RangeMask } from "@/core/document";
import { setLayerMask } from "./edits";

export function rangeParameters(
  document: EditorDocument,
  id: string,
  mask: RangeMask,
): Parameter[] {
  const smoothness: Parameter = {
    id: "smoothness",
    label: "Smoothness",
    min: 0,
    max: 100,
    value: mask.smoothness * 100,
    defaultValue: 50,
    onChange: (value) =>
      setLayerMask(document, id, { ...mask, smoothness: value / 100 }),
  };
  if (mask.kind === "color-range") {
    return [
      {
        id: "tolerance",
        label: "Tolerance",
        min: 0,
        max: 100,
        value: mask.tolerance * 100,
        defaultValue: 25,
        onChange: (value) =>
          setLayerMask(document, id, { ...mask, tolerance: value / 100 }),
      },
      smoothness,
    ];
  }
  return [
    {
      id: "minimum",
      label: "Minimum",
      min: 0,
      max: mask.max * 100,
      value: mask.min * 100,
      defaultValue: Math.min(50, mask.max * 100),
      onChange: (value) =>
        setLayerMask(document, id, { ...mask, min: value / 100 }),
    },
    {
      id: "maximum",
      label: "Maximum",
      min: mask.min * 100,
      max: 100,
      value: mask.max * 100,
      defaultValue: 100,
      onChange: (value) =>
        setLayerMask(document, id, { ...mask, max: value / 100 }),
    },
    smoothness,
  ];
}
