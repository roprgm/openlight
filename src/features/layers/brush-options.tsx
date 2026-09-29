import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import type { ReactNode } from "react";
import {
  type BrushMode,
  useBrushParameters,
  useBrushTool,
} from "@/components/editor/brush-tool";
import { DockChips, DockControls } from "@/components/editor/dock";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";

const targets: readonly (readonly [BrushMode, string, string])[] = [
  ["color", "Color", "Paint colors on a paint layer"],
  ["mask", "Mask", "Paint where a mask adjusts"],
];

const modes = [
  ["paint", "Paint", "Add paint", undefined],
  ["erase", "Erase", "Remove paint", "Hold Alt"],
] as const;

function Chips<T extends string>({
  label,
  menu,
  items,
  value,
  onChange,
}: {
  label: string;
  menu: boolean;
  items: readonly (readonly [T, string, string, string?])[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset
      aria-label={label}
      className="flex gap-0.5 rounded-full bg-hover p-0.5"
    >
      {items.map(([id, label, hint, shortcut]) => (
        <Tooltip key={id}>
          <TooltipTrigger
            render={
              <Chip
                aria-pressed={id === value}
                className={cn("h-6", menu && "flex-1 justify-center")}
                onClick={() => onChange(id)}
              >
                {label}
              </Chip>
            }
          />
          <TooltipContent shortcut={shortcut}>{hint}</TooltipContent>
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
  const { settings, erase, update } = useBrushTool();
  const shownColors = settings.mode === "color" && colors;
  const stroke = erase ? "erase" : "paint";
  const density = useBarDensity();
  const variant = barSlider(density);
  // In the overflow menu the group spans the column, so the two modes share it evenly.
  const menu = density === "menu";
  const parameters = useBrushParameters();
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
              value={stroke}
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
        items={targets}
        value={settings.mode}
        onChange={(mode) => update({ mode })}
      />
      {shownColors}
      <Chips
        label="Brush mode"
        menu={menu}
        items={modes}
        value={stroke}
        onChange={(mode) => update({ erase: mode === "erase" })}
      />
      {parameters.map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} variant={variant} />
      ))}
    </>
  );
}
