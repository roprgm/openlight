import { cva } from "class-variance-authority";
import { cn } from "cn";
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
	variant?: "panel" | "toolbar";
	className?: string;
};

const root = cva("grid grid-cols-[1fr_auto] items-center text-neutral-400", {
	variants: {
		variant: {
			panel: "gap-y-0.5 text-sm",
			toolbar: "w-36 gap-x-3 gap-y-1 text-xs",
		},
	},
});

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
	className,
}: SliderProps) {
	const gradient = stops && {
		background: `linear-gradient(to right, ${stops.join()})`,
	};
	const reset = () => defaultValue !== undefined && onChange(defaultValue);

	return (
		<div className={cn(root({ variant }), className)}>
			<span>{label}</span>
			<div className="relative z-10 flex items-center gap-1">
				<ScrubInput
					aria-label={label}
					max={max}
					min={min}
					onChange={onChange}
					step={step}
					value={value}
					variant="text"
				/>
				{unit && <span className="text-neutral-500">{unit}</span>}
			</div>
			<div
				className="relative col-span-2 my-1 h-1 min-w-11 rounded-full bg-neutral-900 shadow-groove"
				style={gradient}
			>
				<input
					aria-label={label}
					className="absolute top-1/2 h-11 w-full -translate-y-1/2 touch-pan-y appearance-none bg-transparent outline-none [&:focus-visible::-webkit-slider-thumb]:ring-2 [&:focus-visible::-webkit-slider-thumb]:ring-sky-300 [&:focus-visible::-moz-range-thumb]:ring-2 [&:focus-visible::-moz-range-thumb]:ring-sky-300 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-neutral-800 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-neutral-100 [&::-moz-range-thumb]:ring-1 [&::-moz-range-thumb]:ring-neutral-800"
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
