import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

const chip = cva(
  "shrink-0 cursor-pointer rounded-full px-2.5 whitespace-nowrap text-neutral-400 transition-colors hover:bg-white/10 hover:text-neutral-100 focus-visible:outline-1 focus-visible:outline-neutral-400/80 aria-pressed:bg-white/15 aria-pressed:text-neutral-100 data-popup-open:bg-white/15 data-popup-open:text-neutral-100",
  {
    variants: {
      /** "segment" sits inside a ChipGroup. */
      size: {
        default: "h-7 pointer-coarse:h-9",
        segment: "h-6 pointer-coarse:h-8",
      },
    },
    defaultVariants: { size: "default" },
  },
);

/** A pill button for the bar over the canvas; `aria-pressed` shows it on. */
export function Chip({
  className,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof chip>) {
  return (
    <button
      type="button"
      className={cn(chip({ size }), className)}
      {...props}
    />
  );
}

/** Segmented chips, one of which is pressed. */
export function ChipGroup({ className, ...props }: ComponentProps<"fieldset">) {
  return (
    <fieldset
      className={cn("flex gap-0.5 rounded-full bg-white/5 p-0.5", className)}
      {...props}
    />
  );
}
