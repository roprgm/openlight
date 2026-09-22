import { useBrushTool } from "@/components/editor/brush-tool";
import { useDocument, useScene } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { findLayer } from "@/core/document";
import { setHealPatch } from "./edits";
import { useHealing } from "./mode";

const algorithms = [
  { value: "clone", label: "Smart clone" },
  { value: "ai", label: "AI Remove" },
] as const;

export function HealOptions() {
  const document = useDocument();
  const { settings, maxSize, setPreview, update } = useBrushTool();
  const {
    algorithm,
    setAlgorithm,
    feather: nextFeather,
    setFeather,
    selectedPatch,
    ai,
  } = useHealing();
  const layer = useScene((scene) =>
    findLayer(scene.layers, document.selection.getState().layerId),
  );
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
      {ai && (
        <Select
          aria-label="Healing algorithm"
          variant="pill"
          value={algorithm}
          options={algorithms}
          onChange={setAlgorithm}
        />
      )}
      <Slider
        label="Size"
        min={1}
        max={maxSize}
        unit="px"
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
        unit="%"
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
          unit="%"
          valueWidth={3}
          variant={variant}
          onChange={(value) => changePatch({ opacity: value / 100 })}
        />
      )}
    </>
  );
}
