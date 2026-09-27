import { Chip } from "@roprgm/ui/chip";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { useBrushTool } from "@/components/editor/brush-tool";
import { DockControls } from "@/components/editor/dock";
import type { Parameter } from "@/components/editor/parameter";
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
  const density = useBarDensity();
  const feather = selected?.feather ?? nextFeather;
  function changePatch(change: Parameters<typeof setHealPatch>[3]) {
    if (selected && layer?.kind === "heal") {
      setHealPatch(document, layer.id, selected.id, change);
    }
  }
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
      onChange: (value) => update({ size: Math.round(value) }),
    },
    {
      id: "feather",
      label: "Feather",
      value: feather * 100,
      min: 0,
      max: 100,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onEditingChange: setPreview,
      onChange: (value) => {
        const feather = value / 100;
        setFeather(feather);
        changePatch({ feather });
      },
    },
  ];
  if (selected) {
    parameters.push({
      id: "opacity",
      label: "Opacity",
      value: selected.opacity * 100,
      min: 0,
      max: 100,
      format: (value) => `${value}%`,
      valueWidth: 3,
      onChange: (value) => changePatch({ opacity: value / 100 }),
    });
  }
  const automatic = source && (
    <Tooltip>
      <TooltipTrigger
        render={
          <Chip onClick={() => setSource(undefined)}>Automatic source</Chip>
        }
      />
      <TooltipContent>
        Find each stroke's donor again; Alt-click sets one
      </TooltipContent>
    </Tooltip>
  );
  if (density === "dock") {
    return <DockControls header={automatic} parameters={parameters} />;
  }
  return (
    <>
      {parameters.map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} variant={barSlider(density)} />
      ))}
      {automatic}
    </>
  );
}
