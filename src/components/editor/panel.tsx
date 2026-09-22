import { cn } from "cn";
import type { KeyboardEventHandler, ReactNode } from "react";
import { CloseIcon } from "@/components/icons/close";
import { Button } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditorSession } from "./session";

/** The resizable side panel: a fixed header, scrolling controls, and a fixed footer. */
export function EditorPanel({
  header,
  children,
  footer,
  inert,
  onKeyDown,
}: {
  header?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Contents shown but unresponsive, as when the document is a placeholder; the panel still scrolls. */
  inert?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLElement>;
}) {
  const { width, onWidthChange } = useEditorSession();
  return (
    <ResizablePanel
      width={width}
      onWidthChange={onWidthChange}
      className={cn("flex min-h-0 flex-col", inert && "opacity-50")}
      onKeyDown={onKeyDown}
    >
      <div inert={inert} className="contents">
        {header}
      </div>
      <ScrollArea
        fade
        className="flex-1"
        role="region"
        aria-label="Editor controls"
      >
        <div inert={inert}>{children}</div>
      </ScrollArea>
      <div inert={inert} className="contents">
        {footer}
      </div>
    </ResizablePanel>
  );
}

/** A title with optional actions and a close button, sized to the panel row. */
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
    <div className="flex h-10 shrink-0 items-center gap-1 border-b border-black/50 pr-1.5 pl-3">
      <h2 className="flex-1 font-medium text-neutral-200">{title}</h2>
      {children}
      {onClose && (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Close"
          title="Close (Esc)"
          onClick={onClose}
        >
          <CloseIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}
