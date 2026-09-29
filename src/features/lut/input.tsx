import type { RefObject } from "react";

/** The hidden `.cube` picker; clearing it after each pick lets the same file be chosen again. */
export function LutInput({
  ref,
  onChoose,
}: {
  ref: RefObject<HTMLInputElement | null>;
  onChoose: (file: File) => void;
}) {
  return (
    <input
      ref={ref}
      type="file"
      accept=".cube"
      hidden
      onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        if (file) {
          onChoose(file);
        }
        event.currentTarget.value = "";
      }}
    />
  );
}
