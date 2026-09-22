import { type AriaRole, type ReactNode, useId, useRef, useState } from "react";

function focusChoice(surface: HTMLElement) {
  const selected = surface.querySelector<HTMLElement>('[aria-selected="true"]');
  const first = surface.querySelector<HTMLElement>("button:not(:disabled)");
  (selected ?? first)?.focus();
}

function moveFocus(menu: HTMLElement, direction: number) {
  const items = [
    ...menu.querySelectorAll<HTMLElement>("button:not(:disabled)"),
  ];
  const focused = document.activeElement;
  const current = focused instanceof HTMLElement ? items.indexOf(focused) : -1;
  const next =
    current < 0 ? 0 : (current + direction + items.length) % items.length;
  items[next]?.focus();
}

/** Anchored elevated surface shared by command menus and value selectors. */
export function MenuSurface({
  trigger,
  children,
  role = "menu",
}: {
  trigger: (id: string, open: boolean) => ReactNode;
  children: ReactNode;
  role?: AriaRole;
}) {
  const id = useId();
  const popover = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  return (
    <>
      {trigger(id, open)}
      <div
        id={id}
        ref={popover}
        popover="auto"
        onBeforeToggle={(event) => setOpen(event.newState === "open")}
        onToggle={(event) => {
          if (event.newState === "open") {
            requestAnimationFrame(() => {
              const surface = popover.current;
              if (surface?.matches(":popover-open")) focusChoice(surface);
            });
          }
        }}
        className="fixed inset-auto z-50 m-0 mt-1 max-h-[calc(100dvh-1rem)] min-w-40 overflow-y-auto rounded-lg border border-black/60 bg-neutral-800 p-1 text-neutral-200 shadow-float [position-area:bottom_span-left] [position-try-fallbacks:flip-block] [&_button]:w-full [&_button]:rounded-md [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-left [&_button:disabled]:text-neutral-600 [&_button:disabled:hover]:bg-transparent [&_button:hover]:bg-white/8"
      >
        {/* biome-ignore lint/a11y/noStaticElementInteractions: delegated interaction serves the dynamic menu or listbox role. */}
        <div
          role={role}
          onClick={(event) => {
            if (
              event.target instanceof Element &&
              event.target.closest('button[type="submit"]')
            ) {
              popover.current?.hidePopover();
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveFocus(
                event.currentTarget,
                event.key === "ArrowDown" ? 1 : -1,
              );
            }
          }}
        >
          {open && children}
        </div>
      </div>
    </>
  );
}
