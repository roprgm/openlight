import { useState } from "react";
import { useDocument, useScene } from "@/components/editor/session";
import Button from "@/components/ui/button";
import { Tab, TabList } from "@/components/ui/tabs";
import { mixerChannels } from "@/lib/adjustments/mixer";
import { resetMixer, setMixer } from "./edits";

const axes = ["Hue", "Saturation", "Luminance"] as const;

const hsl = (hue: number, saturation: number, lightness: number) =>
	`hsl(${hue} ${saturation}% ${lightness}%)`;

function rail(axis: number, hue: number) {
	if (axis === 0) {
		return `linear-gradient(to top, ${hsl(hue - 45, 80, 55)}, ${hsl(hue, 80, 55)}, ${hsl(hue + 45, 80, 55)})`;
	}
	if (axis === 1) {
		return `linear-gradient(to top, ${hsl(hue, 0, 50)}, ${hsl(hue, 90, 55)})`;
	}
	return `linear-gradient(to top, black, ${hsl(hue, 80, 45)}, white)`;
}

function ChannelSlider({
	name,
	hue,
	axis,
	value,
	onChange,
}: {
	name: string;
	hue: number;
	axis: number;
	value: number;
	onChange: (value: number) => void;
}) {
	return (
		<div className="flex flex-col items-center gap-1">
			<output className="text-neutral-400 text-xs tabular-nums">{value}</output>
			<div className="relative h-32 w-full">
				<div
					className="absolute inset-y-0 left-1/2 w-1 -translate-x-1/2 rounded-full shadow-groove"
					style={{ background: rail(axis, hue) }}
				/>
				<input
					type="range"
					aria-label={`${name} ${axes[axis]}`}
					aria-orientation="vertical"
					className="absolute top-1/2 left-1/2 h-6 w-32 origin-center -translate-x-1/2 -translate-y-1/2 -rotate-90 appearance-none bg-transparent outline-none focus-visible:ring-1 focus-visible:ring-neutral-100/50 [&::-webkit-slider-runnable-track]:bg-transparent [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-neutral-100 [&::-webkit-slider-thumb]:ring-1 [&::-webkit-slider-thumb]:ring-neutral-800 [&::-moz-range-track]:bg-transparent [&::-moz-range-thumb]:size-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-neutral-100 [&::-moz-range-thumb]:ring-1 [&::-moz-range-thumb]:ring-neutral-800"
					min={-100}
					max={100}
					onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
					onDoubleClick={() => onChange(0)}
					value={value}
				/>
			</div>
		</div>
	);
}

export function ColorMixer() {
	const [axis, setAxis] = useState(0);
	const mixer = useScene((scene) => scene.adjustments.mixer);
	const document = useDocument();
	return (
		<section aria-label="Color mixer" className="space-y-2.5">
			<div className="flex items-center gap-2">
				<TabList
					aria-label="Mixer axis"
					className="flex-1 rounded-md bg-neutral-900 p-0.5 shadow-groove"
				>
					{axes.map((label, index) => (
						<Tab
							key={label}
							selected={axis === index}
							onClick={() => setAxis(index)}
							className="flex-1 px-1 py-1"
						>
							{label}
						</Tab>
					))}
				</TabList>
				<Button
					variant="ghost"
					aria-label="Reset color mixer"
					className="shrink-0 px-2 py-1 text-xs"
					onClick={() => resetMixer(document)}
				>
					Reset
				</Button>
			</div>
			<div className="grid grid-cols-8 gap-1">
				{mixerChannels.map((channel, index) => (
					<ChannelSlider
						key={channel.name}
						name={channel.name}
						hue={channel.hue}
						axis={axis}
						value={mixer[index][axis]}
						onChange={(value) => setMixer(document, index, axis, value)}
					/>
				))}
			</div>
		</section>
	);
}
