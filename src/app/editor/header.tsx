import { Tooltip, TooltipContent, TooltipTrigger } from "@roprgm/ui/tooltip";
import type { ReactNode } from "react";

/**
 * Identity on the left, with the file and what opens another beside its name; document actions on
 * the right. Present in every editor state.
 */
export function EditorHeader({
  file,
  open,
  children,
}: {
  file?: string;
  open?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-edge border-b material-panel px-3">
      <span className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="size-5 shrink-0" />
        {/* On a phone the logo alone names the app, leaving room for the file and its actions. */}
        <span className="font-medium text-foreground max-md:hidden">
          OpenLight
        </span>
      </span>
      <span className="flex min-w-0 items-center gap-1">
        {file && (
          <Tooltip>
            <TooltipTrigger
              render={
                <span className="min-w-0 truncate text-secondary">{file}</span>
              }
            />
            <TooltipContent>{file}</TooltipContent>
          </Tooltip>
        )}
        {open}
      </span>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}
