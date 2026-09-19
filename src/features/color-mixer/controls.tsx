import { useId, useState } from "react";
import { useDocument } from "@/components/editor/session";
import { ScrubInput } from "@/components/ui/scrub-input";
import { Tab, TabList } from "@/components/ui/tabs";
import { VerticalSlider } from "@/components/ui/vertical-slider";
import type { ColorMixer } from "@/core/document";
import { setColorMixer } from "./edits";
import { channels, colors, type MixerChannel } from "./model";

function gradient(hue: number, channel: MixerChannel) {
	if (channel === "hue") {
		return [-30, 0, 30].map((shift) => `hsl(${hue + shift} 65% 55%)`);
	}
	if (channel === "saturation") {
		return [0, 50, 100].map((saturation) => `hsl(${hue} ${saturation}% 55%)`);
	}
	return [20, 55, 85].map((lightness) => `hsl(${hue} 65% ${lightness}%)`);
}

function ColorSlider({
	index,
	channel,
	value,
	layerId,
}: {
	index: number;
	channel: MixerChannel;
	value: number;
	layerId: string;
}) {
	const document = useDocument();
	const color = colors[index];
	const label = `${color.label} ${channel}`;
	const change = (value: number) =>
		setColorMixer(document, color.id, { [channel]: value }, layerId);
	return (
		<div
			className="flex min-w-0 flex-col items-center gap-1"
			title={color.label}
		>
			<ScrubInput
				aria-label={`${label} value`}
				className="w-full leading-4 [&>span]:px-0 [&_input]:text-center [&_input]:text-[11px] [&_input]:tracking-tight"
				variant="text"
				value={value}
				onChange={change}
				min={-100}
				max={100}
			/>
			<VerticalSlider
				label={label}
				value={value}
				onChange={change}
				min={-100}
				max={100}
				defaultValue={0}
				stops={gradient(color.hue, channel)}
				color={`hsl(${color.hue} 65% 55%)`}
			/>
		</div>
	);
}

export function ColorMixerControls({
	id: layerId,
	mixer,
}: {
	id: string;
	mixer: ColorMixer;
}) {
	const [channel, setChannel] = useState<MixerChannel>("hue");
	const id = useId();
	return (
		<section className="p-3">
			<TabList
				aria-label="Color Mixer adjustment"
				className="mb-3 gap-0.5 rounded-md bg-neutral-900 p-0.5 shadow-groove"
			>
				{channels.map(({ id: value, label }) => (
					<Tab
						key={value}
						id={`${id}-${value}`}
						aria-controls={`${id}-sliders`}
						selected={channel === value}
						onClick={() => setChannel(value)}
						className="min-w-0 flex-1 rounded px-1 py-1.5"
					>
						{label}
					</Tab>
				))}
			</TabList>
			<div
				id={`${id}-sliders`}
				role="tabpanel"
				aria-labelledby={`${id}-${channel}`}
				className="grid grid-cols-8"
			>
				{colors.map((color, index) => (
					<ColorSlider
						key={color.id}
						index={index}
						channel={channel}
						value={mixer[channel][index]}
						layerId={layerId}
					/>
				))}
			</div>
		</section>
	);
}
