import { CardAction, CardSection } from "@roprgm/ui/card";
import { Notice, NoticeClose } from "@roprgm/ui/notice";

/** Draft storage failures stay out of the way: the editor keeps working and a scene file still saves the work. */
export function DraftNotice({
  error,
  onDismiss,
}: {
  error: string;
  onDismiss: () => void;
}) {
  return (
    <Notice className="fixed bottom-3 left-1/2 z-50 -translate-x-1/2">
      <CardSection className="flex-row items-start">
        <p className="flex-1">
          Drafts can't be kept in this browser: {error} Save a scene from Export
          to keep your edits.
        </p>
        <CardAction>
          <NoticeClose onClick={onDismiss} />
        </CardAction>
      </CardSection>
    </Notice>
  );
}
