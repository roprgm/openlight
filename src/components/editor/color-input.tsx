import { useEffect, useRef } from "react";
import { useDocument } from "./session";

/**
 * A color swatch that opens the browser's color picker. The picker streams changes while it moves
 * and fires `change` once it closes, which ends them as one edit.
 */
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
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = picker.current;
    const commit = () => document.history.commit();
    input?.addEventListener("change", commit);
    return () => input?.removeEventListener("change", commit);
  }, [document]);
  return (
    <input
      ref={picker}
      type="color"
      aria-label={label}
      value={value}
      className="h-6 w-9 cursor-pointer rounded surface-sunken p-0.5"
      onChange={(event) => {
        document.history.begin();
        onChange(event.currentTarget.value);
      }}
    />
  );
}
