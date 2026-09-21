import { Slider } from "@/components/ui/slider";
import { useBrushTool } from "./brush-tool";
import { barSlider, useBarDensity } from "./toolbar";

const modes = [
  ["paint", "Paint", "Add coverage"],
  ["erase", "Erase", "Remove coverage (Alt while painting)"],
] as const;

/** The next stroke's mode, size, edge, and flow, in the bar over the canvas. Alt shows on the Erase chip. */
export function BrushOptions() {
  const { settings, erase, maxSize, update } = useBrushTool();
  const variant = barSlider(useBarDensity());
  return (
    <>
      <fieldset
        aria-label="Brush mode"
        className="flex gap-0.5 rounded-full bg-white/5 p-0.5"
      >
        {modes.map(([mode, label, title]) => (
          <button
            key={mode}
            type="button"
            aria-pressed={erase === (mode === "erase")}
            title={title}
            onClick={() => update({ erase: mode === "erase" })}
            className="h-6 rounded-full px-2.5 text-neutral-400 hover:bg-white/10 hover:text-neutral-100 aria-pressed:bg-white/15 aria-pressed:text-neutral-100 pointer-coarse:h-8"
          >
            {label}
          </button>
        ))}
      </fieldset>
      <Slider
        label="Size"
        value={settings.size}
        min={1}
        max={maxSize}
        unit="px"
        variant={variant}
        onChange={(size) => update({ size: Math.round(size) })}
      />
      <Slider
        label="Feather"
        value={Math.round(settings.feather * 100)}
        min={0}
        max={100}
        defaultValue={50}
        unit="%"
        variant={variant}
        onChange={(value) => update({ feather: value / 100 })}
      />
      <Slider
        label="Flow"
        value={Math.round(settings.flow * 100)}
        min={1}
        max={100}
        defaultValue={100}
        unit="%"
        variant={variant}
        onChange={(value) => update({ flow: value / 100 })}
      />
    </>
  );
}
