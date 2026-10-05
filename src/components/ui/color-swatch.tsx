import { cn } from "cn";
import { type ComponentProps, useEffect, useRef } from "react";

/**
 * A flat square of a color that opens the browser's color picker: a control's shadow without the lit
 * top edge, which would tint the color, and a faint edge that parts it from a background of its
 * color. The picker streams changes while it moves, and `onClose` follows the last of them.
 */
export function ColorSwatch({
  label,
  value,
  onChange,
  onClose,
  className,
  ...props
}: Omit<ComponentProps<"span">, "onChange"> & {
  label: string;
  value: string;
  onChange: (color: string) => void;
  onClose?: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const element = input.current;
    if (!element || !onClose) {
      return;
    }
    element.addEventListener("change", onClose);
    return () => element.removeEventListener("change", onClose);
  }, [onClose]);
  return (
    <span
      {...props}
      className={cn(
        "relative block size-5 shrink-0 rounded-sm shadow-card inset-ring inset-ring-foreground/10 focus-ring",
        className,
      )}
      style={{ backgroundColor: value }}
    >
      <input
        ref={input}
        type="color"
        aria-label={label}
        value={value}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </span>
  );
}
