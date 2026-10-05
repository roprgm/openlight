import { IconButton } from "@roprgm/ui/icon-button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import { cn } from "cn";
import type { ReactNode } from "react";
import { defaultColors, useBrushTool } from "@/components/editor/brush-tool";
import { EyedropperIcon } from "@/components/icons/eyedropper";
import { SwapIcon } from "@/components/icons/swap";
import { SwapCornerIcon } from "@/components/icons/swap-corner";
import { ColorSwatch } from "@/components/ui/color-swatch";
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

type Side = "top" | "right";

function Swatch({
  label,
  value,
  side,
  className,
  onChange,
}: {
  label: string;
  value: string;
  side: Side;
  className: string;
  onChange: (color: string) => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ColorSwatch
            label={label}
            value={value}
            className={cn("absolute", className)}
            onChange={onChange}
          />
        }
      />
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Two squares, as in Photoshop: the primary over the secondary, with `children` in a free corner. */
function Swatches({
  colors,
  side,
  className,
  swatch,
  children,
}: {
  colors: ReturnType<typeof usePaintColors>;
  side: Side;
  className: string;
  swatch: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <Swatch
        label="Secondary color"
        value={colors.secondary}
        side={side}
        className={cn("right-0 bottom-0", swatch)}
        onChange={colors.setSecondary}
      />
      <Swatch
        label="Primary color"
        value={colors.primary}
        side={side}
        className={cn("top-0 left-0", swatch)}
        onChange={colors.setPrimary}
      />
      {children}
    </div>
  );
}

/** The colors in a row, with swap and pick after them. */
export function PaintColors() {
  const colors = usePaintColors();
  return (
    <div className="flex items-center gap-0.5">
      <Swatches
        colors={colors}
        side="top"
        className="m-1 size-7"
        swatch="size-4.5"
      />
      <IconButton
        label="Swap colors"
        shortcut="X"
        side="top"
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
          side="top"
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

/**
 * The colors in the tool rail: pick as one more tool, then the squares with swap in their free
 * corner, as in Photoshop. X swaps from the keyboard, so the arrow takes no focus.
 */
export function RailPaintColors() {
  const colors = usePaintColors();
  return (
    <>
      {colors.pick && (
        <IconButton
          label="Pick a color"
          shortcut="I"
          side="right"
          size="icon-lg"
          className="size-8.5"
          onClick={colors.pick}
        >
          <EyedropperIcon className="size-5" />
        </IconButton>
      )}
      <Swatches
        colors={colors}
        side="right"
        className="mt-2 size-8.5"
        swatch="size-5.25"
      >
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                tabIndex={-1}
                aria-label="Swap colors"
                className="absolute -top-px right-0 flex size-3.25 cursor-pointer items-start justify-end text-secondary transition-colors hover:text-foreground"
                onClick={colors.swap}
              />
            }
          >
            <SwapCornerIcon className="size-2.75" />
          </TooltipTrigger>
          <TooltipContent side="right" shortcut="X">
            Swap colors
          </TooltipContent>
        </Tooltip>
      </Swatches>
    </>
  );
}
