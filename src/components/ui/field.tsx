import { cva } from "class-variance-authority";
import { cn } from "cn";
import type { ComponentProps } from "react";

type FieldProps = ComponentProps<"span"> & {
  /**
   * "box" always shows the chrome; "text" reads as plain text until focused, then sinks a little;
   * "pill" keeps the bar's control height without adding permanent chrome.
   */
  variant?: "box" | "text" | "pill";
};

const chrome = cva("", {
  variants: {
    variant: {
      box: "rounded border border-black bg-neutral-900 px-1 py-0.5 shadow-groove focus-within:ring-1 focus-within:ring-white/10",
      text: "rounded-[2px] px-0.5 py-0.5 focus-within:bg-black/25",
      pill: "h-7 rounded-[2px] px-0.5 focus-within:bg-black/25 pointer-coarse:h-9",
    },
  },
});

/**
 * Sunken chrome around a bare form control (input, select, textarea).
 * The child styles itself with `w-full bg-transparent outline-none`.
 */
export function Field({ variant = "box", className, ...props }: FieldProps) {
  return <span className={cn(chrome({ variant }), className)} {...props} />;
}
