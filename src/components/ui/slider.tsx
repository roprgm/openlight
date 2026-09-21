import { cva } from "class-variance-authority";
import { ScrubInput } from "./scrub-input";

type SliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Restored by double-clicking the bar. */
  defaultValue?: number;
  /** CSS color stops painting the bar left to right, e.g. ["#46f", "#fc3"]. */
  stops?: string[];
  unit?: string;
  /** "panel" stacks the bar under its label; "toolbar" keeps one row; "compact" is that row without the bar. */
  variant?: "panel" | "toolbar" | "compact";
};

// In the bar, the label is inset like the text of the pills around it.
const root = cva("items-center text-neutral-400", {
  variants: {
    variant: {
      panel: "grid grid-cols-[1fr_auto] gap-y-0.5",
      toolbar: "flex gap-1.5 pl-2.5",
      compact: "flex gap-1.5 pl-2.5",
    },
  },
});
const field = cva("relative z-10 flex items-center", {
  variants: {
    variant: { panel: "", toolbar: "order-last", compact: "order-last" },
  },
});
const track = cva(
  "relative h-1 min-w-11 rounded-full bg-neutral-900 shadow-groove",
  {
    variants: {
      variant: { panel: "col-span-2 my-1", toolbar: "w-16", compact: "hidden" },
    },
  },
);
const range = cva(
  "absolute top-1/2 w-full -translate-y-1/2 touch-pan-y appearance-none bg-transparent outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-sky-300 [&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-sky-300 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-neutral-800 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-neutral-100 [&::-moz-range-thumb]:ring-1 [&::-moz-range-thumb]:ring-neutral-800",
  { variants: { variant: { panel: "h-11", toolbar: "h-7", compact: "h-7" } } },
);

/** Labeled slider paired with a scrubbable numeric field. */
export function Slider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  defaultValue,
  stops,
  unit,
  variant = "panel",
}: SliderProps) {
  const gradient = stops && {
    background: `linear-gradient(to right, ${stops.join()})`,
  };
  const reset = () => defaultValue !== undefined && onChange(defaultValue);

  return (
    <div className={root({ variant })}>
      <span>{label}</span>
      <div className={field({ variant })}>
        <ScrubInput
          aria-label={label}
          max={max}
          min={min}
          onChange={onChange}
          step={step}
          unit={unit}
          value={value}
          variant={variant === "panel" ? "text" : "pill"}
        />
      </div>
      <div className={track({ variant })} style={gradient}>
        <input
          aria-label={label}
          className={range({ variant })}
          max={max}
          min={min}
          onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
          onDoubleClick={reset}
          onKeyDown={(event) =>
            event.key === "Enter" && event.currentTarget.blur()
          }
          step={step}
          type="range"
          value={value}
        />
      </div>
    </div>
  );
}
