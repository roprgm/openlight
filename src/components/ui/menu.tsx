import { cva } from "class-variance-authority";
import { type ReactNode, useId, useRef, useState } from "react";

const trigger = cva(
  "grid shrink-0 place-items-center text-neutral-400 hover:text-neutral-100",
  {
    variants: {
      variant: {
        row: "size-7 rounded-md hover:bg-white/8 pointer-coarse:size-10",
        pill: "h-7 rounded-full px-2.5 hover:bg-white/10 pointer-coarse:h-9",
      },
    },
  },
);

/**
 * A button that floats a menu below itself. Submit buttons inside close it; other controls keep it open,
 * so it can hold settings as well as commands. Its children mount only while it is open.
 */
export function Menu({
  label,
  children,
  icon,
  variant = "row",
}: {
  label: string;
  children: ReactNode;
  icon: ReactNode;
  variant?: "row" | "pill";
}) {
  const id = useId();
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        popoverTarget={id}
        className={trigger({ variant })}
      >
        {icon}
      </button>
      <div
        id={id}
        ref={popover}
        popover="auto"
        onBeforeToggle={(event) => setOpen(event.newState === "open")}
        className="fixed inset-auto z-50 m-0 mt-1 max-h-[calc(100dvh-1rem)] min-w-40 overflow-y-auto rounded-lg border border-black/60 bg-neutral-800 p-1 text-neutral-200 shadow-float [position-area:bottom_span-left] [position-try-fallbacks:flip-block] [&_button]:block [&_button]:w-full [&_button]:rounded-md [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-left [&_button:disabled]:text-neutral-600 [&_button:disabled:hover]:bg-transparent [&_button:hover]:bg-white/8"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            popover.current?.hidePopover();
          }}
        >
          {open && children}
        </form>
      </div>
    </>
  );
}
