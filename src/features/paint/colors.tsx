import { IconButton } from "@roprgm/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import { defaultColors, useBrushTool } from "@/components/editor/brush-tool";
import { useBarDensity } from "@/components/editor/toolbar-density";
import { EyedropperIcon } from "@/components/icons/eyedropper";
import { SwapIcon } from "@/components/icons/swap";
import { hexColor } from "@/lib/parse";

/** The brush's primary and secondary colors, and the actions Photoshop keys to X, D, and I. */
export function usePaintColors() {
  const { settings, update } = useBrushTool();
  const [primary, secondary] = settings.colors;
  const EyeDropper = window.EyeDropper;
  return {
    primary,
    secondary,
    setPrimary: (color: string) => update({ colors: [color, secondary] }),
    setSecondary: (color: string) => update({ colors: [primary, color] }),
    swap: () => update({ colors: [secondary, primary] }),
    reset: () => update({ colors: defaultColors }),
    /** Picks the primary color from anywhere on screen, where the browser offers it. */
    pick:
      EyeDropper &&
      (async () => {
        const picked = await new EyeDropper().open().catch(() => undefined);
        const color = hexColor.safeParse(picked?.sRGBHex);
        if (color.success) {
          update({ colors: [color.data, secondary] });
        }
      }),
  };
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <label className="flex size-6 cursor-pointer items-center justify-center rounded-full transition focus-ring hover:bg-hover">
            <span
              className="size-3.5 rounded-full border border-level-8"
              style={{ backgroundColor: value }}
            />
            <input
              type="color"
              aria-label={label}
              value={value}
              className="sr-only"
              onChange={(event) => onChange(event.currentTarget.value)}
            />
          </label>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The primary and secondary colors, grouped like the chips beside them, with swap and pick after. */
export function PaintColors() {
  const colors = usePaintColors();
  // The dock's chips sit sunken, the bar's on its hover fill.
  const fill = useBarDensity() === "dock" ? "bg-field" : "bg-hover";
  return (
    <div className="flex items-center gap-0.5">
      <fieldset
        aria-label="Paint colors"
        className={cn("flex gap-0.5 rounded-full p-0.5", fill)}
      >
        <Swatch
          label="Primary color"
          value={colors.primary}
          onChange={colors.setPrimary}
        />
        <Swatch
          label="Secondary color"
          value={colors.secondary}
          onChange={colors.setSecondary}
        />
      </fieldset>
      <IconButton
        label="Swap colors"
        shortcut="X"
        size="icon-sm"
        className="rounded-full"
        onClick={colors.swap}
      >
        <SwapIcon className="size-4" />
      </IconButton>
      {colors.pick && (
        <IconButton
          label="Pick a color"
          shortcut="I"
          size="icon-sm"
          className="rounded-full"
          onClick={colors.pick}
        >
          <EyedropperIcon className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
