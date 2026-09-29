import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import type { ReactNode } from "react";
import { type BrushMode, useBrushTool } from "@/components/editor/brush-tool";
import { DockChips, DockControls } from "@/components/editor/dock";
import type { Parameter } from "@/components/editor/parameter";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";

const targets: readonly (readonly [BrushMode, string, string])[] = [
  ["color", "Color", "Paint colors on a paint layer"],
  ["mask", "Mask", "Paint where a mask adjusts"],
];

const modes = [
  ["paint", "Paint", "Add paint", undefined],
  ["erase", "Erase", "Remove paint", "Hold Alt"],
] as const;

function Chips({
  label,
  menu,
  items,
}: {
  label: string;
  menu: boolean;
  items: readonly {
    id: string;
    label: string;
    hint: string;
    shortcut?: string;
    pressed: boolean;
    onClick: () => void;
  }[];
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex gap-0.5 rounded-full bg-hover p-0.5"
    >
      {items.map((item) => (
        <Tooltip key={item.id}>
          <TooltipTrigger
            render={
              <Chip
                aria-pressed={item.pressed}
                className={cn("h-6", menu && "flex-1 justify-center")}
                onClick={item.onClick}
              >
                {item.label}
              </Chip>
            }
          />
          <TooltipContent shortcut={item.shortcut}>{item.hint}</TooltipContent>
        </Tooltip>
      ))}
    </fieldset>
  );
}

/**
 * What the brush paints, color or a mask, then the next stroke's mode, size, edge, and flow, in the bar
 * over the canvas or the dock. `colors` follows the Color chip while it is chosen. Alt shows on the Erase chip.
 */
export function BrushOptions({ colors }: { colors?: ReactNode }) {
  const { settings, erase, maxSize, setPreview, update } = useBrushTool();
  const shownColors = settings.mode === "color" && colors;
  const density = useBarDensity();
  const variant = barSlider(density);
  // In the overflow menu the group spans the column, so the two modes share it evenly.
  const menu = density === "menu";
  const parameters: Parameter[] = [
    {
      id: "size",
      label: "Size",
      value: settings.size,
      min: 1,
      max: maxSize,
      format: (value) => `${value}px`,
      valueWidth: `${maxSize}`.length,
      onEditingChange: setPreview,
      onChange: (size) => update({ size: Math.round(size) }),
    },
    {
      id: "feather",
      label: "Feather",
      value: Math.round(settings.feather * 100),
      min: 0,
      max: 100,
      defaultValue: 50,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onEditingChange: setPreview,
      onChange: (value) => update({ feather: value / 100 }),
    },
    {
      id: "flow",
      label: "Flow",
      value: Math.round(settings.flow * 100),
      min: 1,
      max: 100,
      defaultValue: 100,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onChange: (value) => update({ flow: value / 100 }),
    },
  ];
  if (density === "dock") {
    return (
      <DockControls
        header={
          <div className="flex min-w-0 items-center gap-2">
            <DockChips
              label="Brush paints"
              items={targets.map(([mode, label]) => [mode, label] as const)}
              value={settings.mode}
              onChange={(mode) => update({ mode })}
            />
            {shownColors}
            <DockChips
              label="Brush mode"
              items={modes.map(([mode, label]) => [mode, label] as const)}
              value={erase ? "erase" : "paint"}
              onChange={(mode) => update({ erase: mode === "erase" })}
            />
          </div>
        }
        parameters={parameters}
      />
    );
  }
  return (
    <>
      <Chips
        label="Brush paints"
        menu={menu}
        items={targets.map(([mode, label, hint]) => ({
          id: mode,
          label,
          hint,
          pressed: settings.mode === mode,
          onClick: () => update({ mode }),
        }))}
      />
      {shownColors}
      <Chips
        label="Brush mode"
        menu={menu}
        items={modes.map(([mode, label, hint, shortcut]) => ({
          id: mode,
          label,
          hint,
          shortcut,
          pressed: erase === (mode === "erase"),
          onClick: () => update({ erase: mode === "erase" }),
        }))}
      />
      {parameters.map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} variant={variant} />
      ))}
    </>
  );
}
