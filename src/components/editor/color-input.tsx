import { ColorSwatch } from "@/components/ui/color-swatch";
import { useDocument } from "./session";

/** A color swatch that edits the document: a pass through the browser's color picker is one edit. */
export function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
}) {
  const document = useDocument();
  return (
    <ColorSwatch
      label={label}
      value={value}
      onChange={(color) => {
        document.history.begin();
        onChange(color);
      }}
      onClose={document.history.commit}
    />
  );
}
