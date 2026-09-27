import { Notice, NoticeClose } from "@roprgm/ui/notice";
import { Section, SectionAction } from "@roprgm/ui/section";

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
      <Section className="flex-row items-start">
        <p className="flex-1">
          Drafts can't be kept in this browser: {error} Save a scene from Export
          to keep your edits.
        </p>
        <SectionAction>
          <NoticeClose onClick={onDismiss} />
        </SectionAction>
      </Section>
    </Notice>
  );
}
