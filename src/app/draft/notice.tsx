import { Notice } from "@/components/ui/notice";

/** Draft storage failures stay out of the way: the editor keeps working and a scene file still saves the work. */
export function DraftNotice({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <Notice onDismiss={onDismiss}>
      Drafts can't be kept in this browser: {error} Save a scene from Export to
      keep your edits.
    </Notice>
  );
}
