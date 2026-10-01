import { IconButton } from "@roprgm/ui/icon-button";
import { Select } from "@roprgm/ui/select";
import { Slider } from "@roprgm/ui/slider";
import type { ReactNode } from "react";
import { DockControls } from "@/components/editor/dock";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument } from "@/components/editor/session";
import { EyedropperIcon } from "@/components/icons/eyedropper";
import type {
  ColorRange,
  EditorDocument,
  MaskLayer,
  MaskRange,
} from "@/core/document";
import { setMaskRange } from "./edits";
import { defaultRanges } from "./model";
import { useColorPicker } from "./picker";

const kinds = [
  ["none", "None"],
  ["luminance", "Luminance"],
  ["color", "Color"],
] as const;
type Kind = (typeof kinds)[number][0];

const tones = ["#000000", "#ffffff"];

/** The numbers of a range: its tones from low to high and their smoothness, or a color's tolerance. */
export function rangeParameters(
  document: EditorDocument,
  id: string,
  range: MaskRange,
): Parameter[] {
  const percent = { min: 0, max: 100 };
  if (range.kind === "color") {
    return [
      {
        ...percent,
        id: "tolerance",
        label: "Tolerance",
        value: range.tolerance,
        defaultValue: defaultRanges.color.tolerance,
        onChange: (tolerance) =>
          setMaskRange(document, id, { ...range, tolerance }),
      },
    ];
  }
  const { low, high, smoothness } = defaultRanges.luminance;
  // Either end pushes the other along rather than crossing it.
  return [
    {
      ...percent,
      id: "low",
      label: "Low",
      value: range.low,
      stops: tones,
      defaultValue: low,
      onChange: (value) =>
        setMaskRange(document, id, {
          ...range,
          low: value,
          high: Math.max(range.high, value),
        }),
    },
    {
      ...percent,
      id: "high",
      label: "High",
      value: range.high,
      stops: tones,
      defaultValue: high,
      onChange: (value) =>
        setMaskRange(document, id, {
          ...range,
          high: value,
          low: Math.min(range.low, value),
        }),
    },
    {
      ...percent,
      id: "smoothness",
      label: "Smoothness",
      value: range.smoothness,
      defaultValue: smoothness,
      onChange: (value) =>
        setMaskRange(document, id, { ...range, smoothness: value }),
    },
  ];
}

/** Chooses what narrows a mask: nothing, its tones, or a color picked from the photo next. */
function RangeKind({
  layer,
  className,
}: {
  layer: MaskLayer;
  className?: string;
}) {
  const document = useDocument();
  const picker = useColorPicker();
  function choose(kind: Kind) {
    if (kind === (layer.range?.kind ?? "none")) {
      return;
    }
    if (kind === "none") {
      setMaskRange(document, layer.id);
      return;
    }
    setMaskRange(document, layer.id, defaultRanges[kind]);
    if (kind === "color") {
      picker.pick(layer.id);
    }
  }
  return (
    <Select
      raised
      aria-label="Range"
      value={layer.range?.kind ?? "none"}
      items={kinds.map(([value, label]) => ({ value, label }))}
      className={className}
      onValueChange={(kind) => kind && choose(kind)}
    />
  );
}

/** Takes the next click on the photo as the range's color, or cancels a pick under way. */
function PickColor({ id }: { id: string }) {
  const picker = useColorPicker();
  const picking = picker.picking === id;
  return (
    <IconButton
      label="Pick a color from the photo"
      size="icon-sm"
      aria-pressed={picking}
      className="rounded-full aria-pressed:bg-pressed aria-pressed:text-foreground"
      onClick={() => (picking ? picker.cancel() : picker.pick(id))}
    >
      <EyedropperIcon className="size-4" />
    </IconButton>
  );
}

function RangeColor({ id, range }: { id: string; range: ColorRange }) {
  return (
    <div className="flex items-center justify-between text-muted">
      Color
      <span className="flex items-center gap-2">
        <span className="text-foreground uppercase tabular-nums">
          {range.color}
        </span>
        <span
          role="img"
          aria-label={`Color ${range.color}`}
          className="h-6 w-9 rounded surface-sunken"
          style={{ backgroundColor: range.color }}
        />
        <PickColor id={id} />
      </span>
    </div>
  );
}

/** A mask's range in the sidebar: what narrows it, then its color or tones. */
export function MaskRangeControls({ layer }: { layer: MaskLayer }) {
  const document = useDocument();
  const { range } = layer;
  return (
    <section className="flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center justify-between text-muted">
        Range
        <RangeKind layer={layer} className="w-28" />
      </div>
      {range?.kind === "color" && <RangeColor id={layer.id} range={range} />}
      {range &&
        rangeParameters(document, layer.id, range).map(
          ({ id, ...parameter }) => <Slider key={id} {...parameter} />,
        )}
    </section>
  );
}

/** A mask's range in the dock: its dials under the given header, with what narrows it at the end. */
export function MaskRangeDials({
  layer,
  header,
}: {
  layer: MaskLayer;
  header: ReactNode;
}) {
  const document = useDocument();
  const { range } = layer;
  return (
    <DockControls
      header={header}
      action={
        <span className="flex items-center gap-1">
          {range?.kind === "color" && <PickColor id={layer.id} />}
          <RangeKind layer={layer} />
        </span>
      }
      parameters={range && rangeParameters(document, layer.id, range)}
    >
      <p className="px-6 text-center text-balance text-muted">
        Narrow the mask to the tones or colors of the photo below it
      </p>
    </DockControls>
  );
}
