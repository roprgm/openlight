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
              "absolute cursor-pointer rounded-full border border-level-8 ring-2 ring-level-4 has-focus-visible:outline-2 has-focus-visible:outline-focus",
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

/** Two overlapping swatches, primary in front, with swap and pick beside them. */
export function PaintColors() {
  const colors = usePaintColors();
  return (
    <div className="flex items-center">
      <span className="relative mx-1 h-6 w-7.5 shrink-0">
        <Swatch
          label="Secondary color"
          value={colors.secondary}
          className="right-0 bottom-0 size-4"
          onChange={colors.setSecondary}
        />
        <Swatch
          label="Primary color"
          value={colors.primary}
          className="top-0 left-0 size-4.5"
          onChange={colors.setPrimary}
        />
      </span>
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
