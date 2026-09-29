import { IconButton } from "@roprgm/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import { defaultColors, useBrushTool } from "@/components/editor/brush-tool";
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
  className,
  onChange,
}: {
  label: string;
  value: string;
  className: string;
  onChange: (color: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <label
            className={cn(
              "absolute size-4 cursor-pointer rounded-sm surface-raised focus-ring",
              className,
            )}
            style={{ backgroundColor: value }}
          >
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

/** Two raised squares, as in Photoshop: the primary over the secondary, with swap and pick beside them. */
export function PaintColors() {
  const colors = usePaintColors();
  return (
    <div className="flex items-center gap-0.5">
      <div className="relative mx-1 size-6 shrink-0">
        <Swatch
          label="Secondary color"
          value={colors.secondary}
          className="right-0 bottom-0"
          onChange={colors.setSecondary}
        />
        <Swatch
          label="Primary color"
          value={colors.primary}
          className="top-0 left-0"
          onChange={colors.setPrimary}
        />
      </div>
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
