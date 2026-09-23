import { Tooltip } from "@roprgm/ui/tooltip";
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
    <header className="flex h-11 shrink-0 items-center gap-3 border-black border-b layer-panel px-3">
      <span className="flex items-center gap-2">
        <img src="/logo.svg" alt="" className="size-5" />
        <span className="font-medium text-neutral-200">OpenLight</span>
      </span>
      {file && (
        <Tooltip content={file}>
          <span className="min-w-0 truncate text-neutral-500">{file}</span>
        </Tooltip>
      )}
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}
