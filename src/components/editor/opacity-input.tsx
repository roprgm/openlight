import { ScrubInput } from "@roprgm/ui/scrub-input";
import { useEditGesture } from "@/hooks/use-edit-gesture";
import { useDocument } from "./session";

/** An opacity from 0 to 1 as a percentage that drags sideways as one edit and types on click. */
export function OpacityInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (opacity: number) => void;
}) {
  const document = useDocument();
  const gesture = useEditGesture(document.history);
  return (
    <span {...gesture} className="flex">
      <ScrubInput
        aria-label={label}
        value={value * 100}
        min={0}
        max={100}
        defaultValue={100}
        format={(percent) => `${percent}%`}
        minChars={3}
        onChange={(percent) => onChange(percent / 100)}
      />
    </span>
  );
}
