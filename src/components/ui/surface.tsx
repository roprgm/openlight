import { cn } from "cn";
import type { ComponentProps } from "react";

/**
 * The elevated floating panel under menus, selects, and popovers. Render a popup part as one:
 * `<Menu.Popup render={(props) => <Surface {...props} />} />`.
 */
export function Surface({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-surface=""
      className={cn(
        "max-h-(--available-height) min-w-40 origin-(--transform-origin) overflow-y-auto rounded-lg border border-black/60 bg-neutral-800 p-1 text-neutral-200 shadow-float outline-none transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0",
        className,
      )}
      {...props}
    />
  );
}
