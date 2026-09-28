import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import type { ReactNode } from "react";

/** Identity on the left, document actions on the right; present in every editor state. */
export function EditorHeader({
  file,
  children,
}: {
  file?: string;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-edge border-b surface-panel px-3">
      <span className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="size-5 shrink-0" />
        {/* On a phone the logo alone names the app, leaving room for the file and its actions. */}
        <span className="font-medium text-foreground max-md:hidden">
          OpenLight
        </span>
      </span>
      {file && (
        <Tooltip>
          <TooltipTrigger
            render={<span className="min-w-0 truncate text-muted">{file}</span>}
          />
          <TooltipContent>{file}</TooltipContent>
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}
