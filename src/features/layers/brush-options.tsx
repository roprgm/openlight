import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip } from "@roprgm/ui/tooltip";
import { useBrushTool } from "@/components/editor/brush-tool";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";

const modes = [
  ["paint", "Paint", "Add coverage", undefined],
  ["erase", "Erase", "Remove coverage", "Hold Alt"],
] as const;

/** The next stroke's mode, size, edge, and flow, in the bar over the canvas. Alt shows on the Erase chip. */
export function BrushOptions() {
  const { settings, erase, maxSize, setPreview, update } = useBrushTool();
  const variant = barSlider(useBarDensity());
  return (
    <>
      <fieldset
        aria-label="Brush mode"
        className="flex gap-0.5 rounded-full bg-white/5 p-0.5"
      >
        {modes.map(([mode, label, hint, shortcut]) => (
          <Tooltip key={mode} content={hint} shortcut={shortcut}>
            <Chip
              aria-pressed={erase === (mode === "erase")}
              className="h-6"
              onClick={() => update({ erase: mode === "erase" })}
            >
              {label}
            </Chip>
          </Tooltip>
        ))}
      </fieldset>
      <Slider
        label="Size"
        value={settings.size}
        min={1}
        max={maxSize}
        format={(value) => `${value}px`}
        valueWidth={`${maxSize}`.length}
        variant={variant}
        onEditingChange={setPreview}
        onChange={(size) => update({ size: Math.round(size) })}
      />
      <Slider
        label="Feather"
        value={Math.round(settings.feather * 100)}
        min={0}
        max={100}
        defaultValue={50}
        format={(value) => `${value}%`}
        valueWidth={3}
        variant={variant}
        onEditingChange={setPreview}
        onChange={(value) => update({ feather: value / 100 })}
      />
      <Slider
        label="Flow"
        value={Math.round(settings.flow * 100)}
        min={1}
        max={100}
        defaultValue={100}
        format={(value) => `${value}%`}
        valueWidth={3}
        variant={variant}
        onChange={(value) => update({ flow: value / 100 })}
      />
    </>
  );
}
