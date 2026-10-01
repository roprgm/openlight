import { Chip } from "@roprgm/ui/chip";
import { IconButton } from "@roprgm/ui/icon-button";
import { Slider } from "@roprgm/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { DockControls } from "@/components/editor/dock";
import type { Parameter } from "@/components/editor/parameter";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { SparklesIcon } from "@/components/icons/sparkles";
import { setHealPatch } from "./edits";
import { useHealBrush, useHealing, useSelectedHealPatch } from "./mode";
import { HealModeButtons, HealModeIcon } from "./mode-buttons";

export function HealOptions() {
  const document = useDocument();
  const { parameters: brushParameters } = useHealBrush();
  const { source, setSource, mode } = useHealing();
  const layer = useSelectedLayer();
  const selected = useSelectedHealPatch();
  const density = useBarDensity();
  const modeLabel = mode === "heal" ? "Heal mode" : "Clone mode";
  function changePatch(change: Parameters<typeof setHealPatch>[3]) {
    if (selected && layer?.kind === "heal") {
      setHealPatch(document, layer.id, selected.id, change);
    }
  }
  const parameters: Parameter[] = [...brushParameters];
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
    return (
      <DockControls
        header={<HealModeButtons />}
        action={
          source && (
            <IconButton
              label="Use automatic source · Alt-click sets a source"
              className="pointer-coarse:size-10"
              onClick={() => setSource(undefined)}
            >
              <SparklesIcon className="size-5" />
            </IconButton>
          )
        }
        parameters={parameters}
      />
    );
  }
  return (
    <>
      <span
        role="img"
        aria-label={modeLabel}
        className="grid size-6 shrink-0 place-items-center"
      >
        <HealModeIcon className="size-4" />
      </span>
      {parameters.map(({ id, ...parameter }) => (
        <Slider key={id} {...parameter} variant={barSlider(density)} />
      ))}
      {automatic}
    </>
  );
}
