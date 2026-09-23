import { IconButton } from "@roprgm/ui/icon-button";
import {
  PanelBody as Body,
  PanelHeader as Header,
  Panel,
} from "@roprgm/ui/panel";
import type { ComponentProps, ReactNode } from "react";
import { CloseIcon } from "@/components/icons/close";
import { useEditorSession } from "./session";

/**
 * The resizable side panel, a bottom sheet on mobile. Its sections stack in the order written,
 * with a divider between each; give one a PanelBody to scroll. An inert panel dims its contents.
 */
export function EditorPanel({ inert, ...props }: ComponentProps<"aside">) {
  const { width, onWidthChange } = useEditorSession();
  return (
    <Panel
      width={width}
      onWidthChange={onWidthChange}
      inert={inert}
      // Inert content is already hidden from assistive technology; say so for tools that read ARIA only.
      aria-hidden={inert}
      data-inert={inert}
      className="h-[45%] divide-black max-md:w-full! max-md:border-black max-md:border-t md:h-auto data-[inert=true]:*:opacity-50"
      {...props}
    />
  );
}

/** The panel section that takes the remaining height and scrolls. */
export function PanelBody({ children }: { children: ReactNode }) {
  return (
    <Body role="region" aria-label="Editor controls">
      {children}
    </Body>
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
    <Header title={title} className="border-black/50 border-b">
      {children}
      {onClose && (
        <IconButton
          label="Close"
          shortcut="Esc"
          size="icon-sm"
          onClick={onClose}
        >
          <CloseIcon className="size-4" />
        </IconButton>
      )}
    </Header>
  );
}
