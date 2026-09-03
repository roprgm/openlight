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
};

const track =
	"col-span-2 my-1 h-[4px] appearance-none rounded-full bg-neutral-900 shadow-groove outline-none focus-visible:ring-1 focus-visible:ring-neutral-100/50 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-neutral-800 [&::-moz-range-thumb]:size-2.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-neutral-100 [&::-moz-range-thumb]:ring-1 [&::-moz-range-thumb]:ring-neutral-800";

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
}: SliderProps) {
	const gradient = stops && {
		background: `linear-gradient(to right, ${stops.join()})`,
	};
	const reset = () => defaultValue !== undefined && onChange(defaultValue);

	return (
		<div className="grid grid-cols-[1fr_auto] items-center gap-y-0.5 text-neutral-400 text-sm">
			<span>{label}</span>
			<ScrubInput
				aria-label={label}
				max={max}
				min={min}
				onChange={onChange}
				step={step}
				value={value}
				variant="text"
			/>
			<input
				aria-label={label}
				className={track}
				max={max}
				min={min}
				onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
				onDoubleClick={reset}
				step={step}
				style={gradient}
				type="range"
				value={value}
			/>
		</div>
	);
}
