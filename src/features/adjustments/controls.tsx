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

const controls = [
	["exposure", "Exposure"],
	["contrast", "Contrast"],
	["highlights", "Highlights"],
	["shadows", "Shadows"],
	["whites", "Whites"],
	["blacks", "Blacks"],
	["incrementalTemperature", "Temp"],
	["incrementalTint", "Tint"],
	["vibrance", "Vibrance"],
	["saturation", "Saturation"],
] as const;

export function AdjustmentControls({
	id,
	adjustments,
	temperature,
}: {
	id: string;
	adjustments: Readonly<Adjustments>;
	temperature?: ReactNode;
}) {
	const document = useDocument();
	return (
		<section className="flex flex-col gap-2 p-3">
			{controls.map(([name, label]) => {
				if (temperature && name === "incrementalTemperature") {
					return (
						<div key={name} className="flex flex-col gap-2">
							{temperature}
						</div>
					);
				}
				if (temperature && name === "incrementalTint") {
					return null;
				}
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
						onChange={(value) =>
							setAdjustments(document, { [name]: value }, id)
						}
					/>
				);
			})}
		</section>
	);
}
