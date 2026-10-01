import { cn } from "cn";
import { type ComponentProps, useEffect, useRef } from "react";

/**
 * A raised square of a color that opens the browser's color picker. The picker streams changes while
 * it moves, and `onClose` follows the last of them.
 */
export function ColorSwatch({
  label,
  value,
  onChange,
  onClose,
  className,
  ...props
}: Omit<ComponentProps<"label">, "onChange"> & {
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
    <label
      {...props}
      className={cn(
        "block size-5 shrink-0 cursor-pointer rounded-sm surface-raised focus-ring",
        className,
      )}
      style={{ backgroundColor: value }}
    >
      <input
        ref={input}
        type="color"
        aria-label={label}
        value={value}
        className="sr-only"
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </label>
  );
}
