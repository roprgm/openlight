import { CloseIcon } from "@/components/icons/close";
import Button from "@/components/ui/button";

/** Draft storage failures stay out of the way: the editor keeps working and a scene file still saves the work. */
export function DraftNotice({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2 flex max-w-sm items-start gap-2 rounded-lg border border-black/60 bg-neutral-800 py-2 pr-1 pl-3 text-neutral-300 shadow-float"
    >
      <p>
        Drafts can't be kept in this browser: {error} Save a scene from Export
        to keep your edits.
      </p>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Dismiss"
        onClick={onDismiss}
      >
        <CloseIcon />
      </Button>
    </div>
  );
}
