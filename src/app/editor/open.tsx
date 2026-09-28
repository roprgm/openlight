import { IconButton } from "@roprgm/ui/icon-button";
import { Notice, NoticeClose } from "@roprgm/ui/notice";
import { Section, SectionAction } from "@roprgm/ui/section";
import { Spinner } from "@roprgm/ui/spinner";
import { type RefObject, useRef } from "react";
import { sceneExtension } from "@/app/loaders/scene";
import type { OpenFailure } from "@/app/workspace";
import { OpenIcon } from "@/components/icons/open";
import { TextLink } from "@/components/ui/text-link";
import { accept } from "@/core/image/decode";
import { useShortcuts } from "@/hooks/use-shortcuts";

type OpenProps = { onOpen: (files: File[]) => void };

/** The hidden picker for images and scenes; clearing it after each pick lets the same file open again. */
function FileInput({
  ref,
  onOpen,
}: OpenProps & { ref: RefObject<HTMLInputElement | null> }) {
  return (
    <input
      ref={ref}
      type="file"
      accept={`${accept},${sceneExtension}`}
      multiple
      hidden
      onChange={(event) => {
        const files = event.currentTarget.files;
        if (files?.length) {
          onOpen(Array.from(files));
        }
        event.currentTarget.value = "";
      }}
    />
  );
}

/** The drop hint doubles as the picker: "choose a file" opens the input. */
export function OpenImage({ onOpen }: OpenProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <p className="mt-4 text-muted">
      Drop an image here or{" "}
      <TextLink onClick={() => input.current?.click()}>choose a file</TextLink>
      <FileInput ref={input} onOpen={onOpen} />
    </p>
  );
}

/** Opens another image or scene from the header, in place of the current document once it loads. */
export function OpenButton({ onOpen }: OpenProps) {
  const input = useRef<HTMLInputElement>(null);
  const open = () => input.current?.click();
  useShortcuts({ "mod+o": open });
  return (
    <>
      <IconButton
        label="Open an image or scene"
        shortcut="Mod O"
        size="icon"
        className="pointer-coarse:size-10"
        onClick={open}
      >
        <OpenIcon className="size-4" />
      </IconButton>
      <FileInput ref={input} onOpen={onOpen} />
    </>
  );
}

/** While another file opens, or after it fails, the current document stays and this says why. */
export function OpenStatus({
  opening,
  failure,
  onDismiss,
}: {
  opening?: string;
  failure?: OpenFailure;
  onDismiss: () => void;
}) {
  if (!opening && !failure) {
    return null;
  }
  return (
    <Notice
      tone={failure ? "alert" : "status"}
      className="fixed top-14 left-1/2 z-50 w-96 max-w-[calc(100%-1.5rem)] -translate-x-1/2"
    >
      <Section className="flex-row items-start gap-2">
        {failure ? (
          <>
            <p className="flex-1">
              Couldn't open {failure.file}: {failure.error}
            </p>
            <SectionAction>
              <NoticeClose onClick={onDismiss} />
            </SectionAction>
          </>
        ) : (
          <>
            <Spinner className="mt-0.5 size-4 shrink-0" />
            <p className="min-w-0 flex-1 truncate">Opening {opening}…</p>
          </>
        )}
      </Section>
    </Notice>
  );
}
