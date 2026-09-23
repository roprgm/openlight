import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip } from "@roprgm/ui/tooltip";
import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { setHealPatch } from "./edits";
import { useHealing } from "./mode";

export function HealOptions() {
  const document = useDocument();
  const { settings, maxSize, setPreview, update } = useBrushTool();
  const {
    feather: nextFeather,
    setFeather,
    source,
    setSource,
    selectedPatch,
  } = useHealing();
  const layer = useSelectedLayer();
  const selected =
    layer?.kind === "heal"
      ? layer.patches.find((patch) => patch.id === selectedPatch)
      : undefined;
  const variant = barSlider(useBarDensity());
  const size = settings.size;
  const feather = selected?.feather ?? nextFeather;
  function changePatch(change: Parameters<typeof setHealPatch>[3]) {
    if (selected && layer?.kind === "heal") {
      setHealPatch(document, layer.id, selected.id, change);
    }
  }
  return (
    <>
      <Slider
        label="Size"
        min={1}
        max={maxSize}
        format={(value) => `${value}px`}
        valueWidth={`${maxSize}`.length}
        variant={variant}
        value={size}
        onEditingChange={setPreview}
        onChange={(value) => update({ size: Math.round(value) })}
      />
      <Slider
        label="Feather"
        value={feather * 100}
        min={0}
        max={100}
        format={(value) => `${value}%`}
        valueWidth={3}
        variant={variant}
        onEditingChange={setPreview}
        onChange={(value) => {
          const feather = value / 100;
          setFeather(feather);
          changePatch({ feather });
        }}
      />
      {selected && (
        <Slider
          label="Opacity"
          value={selected.opacity * 100}
          min={0}
          max={100}
          format={(value) => `${value}%`}
          valueWidth={3}
          variant={variant}
          onChange={(value) => changePatch({ opacity: value / 100 })}
        />
      )}
      {source && (
        <Tooltip content="Find each stroke's donor again; Alt-click sets one">
          <Chip onClick={() => setSource(undefined)}>Automatic source</Chip>
        </Tooltip>
      )}
    </>
  );
}
