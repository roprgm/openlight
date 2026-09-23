import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { Tooltip } from "./tooltip";

const button = cva(
  "cursor-pointer rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-neutral-400/80 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-neutral-700 text-neutral-100 shadow-ridge hover:bg-neutral-600 active:bg-neutral-700 active:shadow-groove",
        ghost:
          "text-neutral-400 hover:bg-neutral-700/50 hover:text-neutral-100 active:bg-neutral-700 data-popup-open:bg-neutral-700/50 data-popup-open:text-neutral-100",
      },
      /** Both sizes pad 6 px vertically, so text and 16 px icons produce the same height. */
      size: {
        default: "px-4 py-1.5",
        icon: "grid place-items-center p-1.5",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof button>) {
  return (
    <button
      className={cn(button({ variant, size }), className)}
      type="button"
      {...props}
    />
  );
}

/** A ghost icon button; its label names it for assistive technology and shows as its tooltip. */
export function IconButton({
  label,
  shortcut,
  side,
  ...props
}: ComponentProps<typeof Button> & {
  label: string;
  shortcut?: string;
  side?: ComponentProps<typeof Tooltip>["side"];
}) {
  return (
    <Tooltip content={label} shortcut={shortcut} side={side}>
      <Button variant="ghost" size="icon" aria-label={label} {...props} />
    </Tooltip>
  );
}
