import { cn } from "cn";
import { type ComponentProps, forwardRef } from "react";

/** Shared row chrome for selectable collections in editor panels. */
export const PanelListItem = forwardRef<
  HTMLDivElement,
  ComponentProps<"div"> & { selected?: boolean; muted?: boolean }
>(function PanelListItem(
  { selected = false, muted = false, className, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      data-selected={selected}
      data-muted={muted}
      className={cn(
        "group relative flex h-10 items-center border-b border-black/50 text-neutral-300 pointer-coarse:h-12 data-[selected=false]:hover:bg-white/5 data-[selected=true]:bg-neutral-700 data-[muted=true]:text-neutral-500",
        className,
      )}
    />
  );
});
