import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";
import { Icon } from "@/components/icons/icon";

type SelectProps = ComponentProps<"select"> & {
  /** "field" sinks into panel chrome; "pill" sits in the bar over the canvas. */
  variant?: "field" | "pill";
};

const frame = cva("relative inline-flex items-center", {
  variants: {
    variant: {
      field:
        "rounded border border-black bg-neutral-900 shadow-groove focus-within:ring-1 focus-within:ring-white/10",
      pill: "h-7 rounded-full bg-white/10 hover:bg-white/15 pointer-coarse:h-9",
    },
  },
});
const control = cva(
  "w-full cursor-pointer appearance-none bg-transparent outline-none [color-scheme:dark]",
  {
    variants: {
      variant: {
        field: "py-0.5 pr-6 pl-1 text-neutral-100",
        pill: "h-full pr-7 pl-3 text-neutral-200",
      },
    },
  },
);

/** A native select with the app's chrome and chevron; options come as children. */
export function Select({
  variant = "field",
  className,
  children,
  ...props
}: SelectProps) {
  return (
    <span className={cn(frame({ variant }), className)}>
      <select {...props} className={control({ variant })}>
        {children}
      </select>
      <Icon className="pointer-events-none absolute top-1/2 right-2 size-3 -translate-y-1/2 text-neutral-400">
        <path d="m6 9 6 6 6-6" />
      </Icon>
    </span>
  );
}
