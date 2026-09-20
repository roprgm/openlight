import type { ReactNode } from "react";
import { useDocument } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import type { Adjustments } from "@/core/document";
import { setAdjustments } from "./edits";
import { adjustmentLimits, defaultAdjustments } from "./model";

const stops: Partial<Record<keyof Adjustments, string[]>> = {
	incrementalTemperature: ["#4a6fc3", "#c3b84a"],
	incrementalTint: ["#5ab34a", "#b34ab3"],
	saturation: [
		"#7b7d85",
		"#868686 50%",
		"#7fa066 68%",
		"#b8a75c 84%",
		"#c25a48",
	],
};

const tone = [
	["exposure", "Exposure"],
	["contrast", "Contrast"],
	["highlights", "Highlights"],
	["shadows", "Shadows"],
	["whites", "Whites"],
	["blacks", "Blacks"],
] as const;
const color = [
	["incrementalTemperature", "Temp"],
	["incrementalTint", "Tint"],
	["vibrance", "Vibrance"],
	["saturation", "Saturation"],
] as const;
type Control = (typeof tone)[number] | (typeof color)[number];

function AdjustmentSliders({
	id,
	adjustments,
	controls,
}: {
	id: string;
	adjustments: Readonly<Adjustments>;
	controls: readonly Control[];
}) {
	const document = useDocument();
	return controls.map(([name, label]) => {
		const step = name === "exposure" ? 0.01 : 1;
		const gradient = name === "vibrance" ? stops.saturation : stops[name];
		return (
			<Slider
				key={name}
				label={label}
				value={adjustments[name]}
				step={step}
				stops={gradient}
				min={-adjustmentLimits[name]}
				max={adjustmentLimits[name]}
				defaultValue={defaultAdjustments[name]}
				onChange={(value) => setAdjustments(document, { [name]: value }, id)}
			/>
		);
	});
}

/** The temperature slot replaces the incremental temperature and tint sliders. */
export function AdjustmentControls({
	id,
	adjustments,
	temperature,
}: {
	id: string;
	adjustments: Readonly<Adjustments>;
	temperature?: ReactNode;
}) {
	return (
		<section className="flex flex-col gap-2 p-3">
			<AdjustmentSliders id={id} adjustments={adjustments} controls={tone} />
			<hr className="my-1 border-black/50" />
			{temperature}
			<AdjustmentSliders
				id={id}
				adjustments={adjustments}
				controls={temperature ? color.slice(2) : color}
			/>
		</section>
	);
}
