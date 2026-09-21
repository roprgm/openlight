type VerticalSliderProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  defaultValue?: number;
  stops: readonly string[];
  color: string;
};

/** Native vertical range: up increases, down decreases, double-click restores the default. */
export function VerticalSlider({
  label,
  value,
  onChange,
  min,
  max,
  defaultValue,
  stops,
  color,
}: VerticalSliderProps) {
  return (
    <div className="relative flex h-44 w-full justify-center">
      <div
        className="pointer-events-none absolute inset-y-2 w-1 rounded-full shadow-groove"
        style={{ background: `linear-gradient(to top, ${stops.join()})` }}
      />
      <input
        aria-label={label}
        aria-orientation="vertical"
        className="relative h-full w-full touch-none cursor-ns-resize appearance-none bg-transparent [direction:rtl] [writing-mode:vertical-lr] focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-neutral-400 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-current [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-black/30 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-current [&::-moz-range-thumb]:ring-1 [&::-moz-range-thumb]:ring-black/30"
        style={{ color }}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
        onDoubleClick={() =>
          defaultValue !== undefined && onChange(defaultValue)
        }
      />
    </div>
  );
}
