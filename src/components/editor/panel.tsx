import { IconButton } from "@roprgm/ui/icon-button";
import { ScrollArea } from "@roprgm/ui/scroll-area";
import { Section, SectionAction } from "@roprgm/ui/section";
import { cn } from "cn";
import type {
  ComponentProps,
  CSSProperties,
  PointerEvent,
  ReactNode,
} from "react";
import { CloseIcon } from "@/components/icons/close";
import { useEditorSession } from "./session";

/**
 * The resizable sidebar of the desktop layout. Its sections stack in the order written, with a line
 * between each; give one a PanelBody to scroll. An inert panel dims its contents.
 */
export function EditorPanel({
  inert,
  children,
  className,
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
      className={cn(
        "relative flex min-h-0 w-(--width) shrink-0 flex-col border-edge border-l material-panel data-[inert=true]:*:opacity-50",
        className,
      )}
      style={{ "--width": `${width}px` } as CSSProperties}
      {...props}
    >
      <div
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1 after:w-px after:transition-colors hover:after:bg-control"
        onPointerDown={(event) =>
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        onPointerMove={resize}
      />
      <div className="flex min-h-0 flex-1 flex-col *:not-last:shadow-[inset_0_-1px_0_var(--color-edge)]">
        {children}
      </div>
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
    <Section className="shrink-0 flex-row items-center shadow-[inset_0_-1px_0_var(--color-edge)]">
      <h2
        tabIndex={-1}
        className="flex-1 overflow-fade-x whitespace-nowrap font-medium text-foreground"
      >
        {title}
      </h2>
      {(children || onClose) && (
        <SectionAction>
          {children}
          {onClose && (
            <IconButton
              label="Close"
              shortcut="Esc"
              size="icon"
              onClick={onClose}
            >
              <CloseIcon className="size-4" />
            </IconButton>
          )}
        </SectionAction>
      )}
    </Section>
  );
}
