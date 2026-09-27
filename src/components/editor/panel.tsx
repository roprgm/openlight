import { IconButton } from "@roprgm/ui/icon-button";
import { ScrollArea } from "@roprgm/ui/scroll-area";
import type { ComponentProps, PointerEvent, ReactNode } from "react";
import { CloseIcon } from "@/components/icons/close";
import { useEditorSession } from "./session";

/**
 * The resizable side panel, a bottom sheet on mobile. Its sections stack in the order written,
 * with a divider between each; give one a PanelBody to scroll. An inert panel dims its contents.
 */
export function EditorPanel({
  inert,
  children,
  ...props
}: ComponentProps<"aside">) {
  const { width, onWidthChange } = useEditorSession();
  function resize(event: PointerEvent) {
    if (event.buttons !== 1) {
      return;
    }
    onWidthChange(Math.min(400, Math.max(240, width - event.movementX)));
  }
  return (
    <aside
      inert={inert}
      // Inert content is already hidden from assistive technology; say so for tools that read ARIA only.
      aria-hidden={inert}
      data-inert={inert}
      // A black edge parts it from the canvas: along the top as a bottom sheet, on the left beside it.
      className="relative flex h-[45%] min-h-0 shrink-0 flex-col divide-y divide-black border-black layer-panel max-md:w-full! max-md:border-t md:h-auto md:border-l data-[inert=true]:*:opacity-50"
      style={{ width }}
      {...props}
    >
      <div
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px after:transition-colors hover:after:bg-raised-hover"
        onPointerDown={(event) =>
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        onPointerMove={resize}
      />
      {children}
    </aside>
  );
}

/** The section that takes the remaining height: its header stays put while the rest scrolls. */
export function PanelBody({
  header,
  children,
}: {
  header: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label="Editor controls"
      className="flex min-h-0 flex-1 flex-col"
    >
      {header}
      <ScrollArea fade className="flex-1">
        {children}
      </ScrollArea>
    </section>
  );
}

/** A title with optional actions and a close button, ruled off from what follows. */
export function PanelHeader({
  title,
  children,
  onClose,
}: {
  title: string;
  children?: ReactNode;
  onClose?: () => void;
}) {
  return (
    // An IconButton sits 6px from the top, bottom, and end.
    <div className="flex h-10 shrink-0 items-center gap-1 border-black/50 border-b pr-1.5 pl-3.5">
      <h2
        tabIndex={-1}
        className="flex-1 overflow-fade-x whitespace-nowrap font-medium text-foreground"
      >
        {title}
      </h2>
      {children}
      {onClose && (
        <IconButton label="Close" shortcut="Esc" size="icon" onClick={onClose}>
          <CloseIcon className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
