import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import { useBrushTool } from "@/components/editor/brush-tool";
import { DockChips, DockControls } from "@/components/editor/dock";
import type { Parameter } from "@/components/editor/parameter";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";

const modes = [
  ["paint", "Paint", "Add coverage", undefined],
  ["erase", "Erase", "Remove coverage", "Hold Alt"],
] as const;

/** The next stroke's mode, size, edge, and flow, in the bar over the canvas or the dock. Alt shows on the Erase chip. */
export function BrushOptions() {
  const { settings, erase, maxSize, setPreview, update } = useBrushTool();
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
          <DockChips
            label="Brush mode"
            items={modes.map(([mode, label]) => [mode, label] as const)}
            value={erase ? "erase" : "paint"}
            onChange={(mode) => update({ erase: mode === "erase" })}
          />
        }
        parameters={parameters}
      />
    );
  }
  return (
    <>
      <fieldset
        aria-label="Brush mode"
        className="flex gap-0.5 rounded-full bg-hover p-0.5"
      >
        {modes.map(([mode, label, hint, shortcut]) => (
          <Tooltip key={mode}>
            <TooltipTrigger
              render={
                <Chip
                  aria-pressed={erase === (mode === "erase")}
                  className={cn("h-6", menu && "flex-1 justify-center")}
                  onClick={() => update({ erase: mode === "erase" })}
                >
                  {label}
                </Chip>
              }
            />
            <TooltipContent shortcut={shortcut}>{hint}</TooltipContent>
          </Tooltip>
        ))}
      </fieldset>
      {parameters.map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} variant={variant} />
      ))}
    </>
  );
}
