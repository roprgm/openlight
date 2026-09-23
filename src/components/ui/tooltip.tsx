import { Tooltip as Primitive } from "@base-ui/react/tooltip";
import type { ReactElement, ReactNode } from "react";

/** Shares hover timing, so moving between controls shows their tips without waiting again. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <Primitive.Provider delay={500}>{children}</Primitive.Provider>;
}

const mac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/** Writes "Mod" as the platform's command key. */
function keys(shortcut: string) {
  return shortcut.replace("Mod", mac ? "⌘" : "Ctrl");
}

/**
 * A short hint on hover or keyboard focus, with an optional shortcut. It wraps one element that
 * accepts a ref and props, and names nothing for assistive technology; the element keeps its own label.
 */
export function Tooltip({
  content,
  shortcut,
  side = "bottom",
  disabled,
  children,
}: {
  content: ReactNode;
  shortcut?: string;
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  children: ReactElement;
}) {
  return (
    <Primitive.Root disabled={disabled}>
      <Primitive.Trigger render={children} />
      <Primitive.Portal>
        <Primitive.Positioner side={side} sideOffset={6} className="z-50">
          <Primitive.Popup className="flex max-w-64 origin-(--transform-origin) items-center gap-2 rounded-md border border-black/60 bg-neutral-950 px-2 py-1 text-neutral-200 shadow-float transition-[opacity,scale] duration-100 data-ending-style:opacity-0 data-instant:transition-none data-starting-style:scale-95 data-starting-style:opacity-0">
            {content}
            {shortcut && (
              <kbd className="text-neutral-500">{keys(shortcut)}</kbd>
            )}
          </Primitive.Popup>
        </Primitive.Positioner>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
