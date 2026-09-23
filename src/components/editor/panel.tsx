import type { ComponentProps, ReactNode } from "react";
import { CloseIcon } from "@/components/icons/close";
import { IconButton } from "@/components/ui/button";
import { ResizablePanel } from "@/components/ui/resizable-panel";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useEditorSession } from "./session";

/**
 * The resizable side panel. Its sections stack in the order written, with a divider between each;
 * give one a PanelBody to scroll. An inert panel shows its contents dimmed and unresponsive.
 */
export function EditorPanel({
  inert,
  children,
  ...props
}: ComponentProps<"aside">) {
  const { width, onWidthChange } = useEditorSession();
  return (
    <ResizablePanel width={width} onWidthChange={onWidthChange} {...props}>
      <div
        inert={inert}
        data-inert={inert}
        className="flex h-full min-h-0 flex-col divide-y divide-black data-[inert=true]:opacity-50"
      >
        {children}
      </div>
    </ResizablePanel>
  );
}

/** The panel section that takes the remaining height and scrolls. */
export function PanelBody({ children }: { children: ReactNode }) {
  return (
    <ScrollArea
      fade
      className="flex-1"
      role="region"
      aria-label="Editor controls"
    >
      {children}
    </ScrollArea>
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
        <IconButton label="Close" shortcut="Esc" onClick={onClose}>
          <CloseIcon className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
