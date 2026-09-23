import { useBrushTool } from "@/components/editor/brush-tool";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { Chip, ChipGroup } from "@/components/ui/chip";
import { Slider } from "@/components/ui/slider";
import { Tooltip } from "@/components/ui/tooltip";

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
      <ChipGroup aria-label="Brush mode">
        {modes.map(([mode, label, hint, shortcut]) => (
          <Tooltip key={mode} content={hint} shortcut={shortcut}>
            <Chip
              size="segment"
              aria-pressed={erase === (mode === "erase")}
              onClick={() => update({ erase: mode === "erase" })}
            >
              {label}
            </Chip>
          </Tooltip>
        ))}
      </ChipGroup>
      <Slider
        label="Size"
        value={settings.size}
        min={1}
        max={maxSize}
        unit="px"
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
        unit="%"
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
        unit="%"
        valueWidth={3}
        variant={variant}
        onChange={(value) => update({ flow: value / 100 })}
      />
    </>
  );
}
