import type { ComponentProps, ReactNode } from "react";
import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { setAdjustments } from "@/lib/editor/document/edits";
import {
	type Adjustments,
	adjustmentLimits,
	adjustmentMinimums,
	defaultAdjustments,
} from "@/lib/editor/scene";

const stops = {
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

type AdjustmentSliderProps = Pick<
	ComponentProps<typeof Slider>,
	"label" | "step" | "stops"
> & {
	name: keyof Adjustments;
};

function AdjustmentSlider({ name, ...props }: AdjustmentSliderProps) {
	const value = useScene((scene) => scene.adjustments[name]);
	const document = useDocument();
	return (
		<Slider
			{...props}
			value={value}
			onChange={(value) => setAdjustments(document, { [name]: value })}
			defaultValue={defaultAdjustments[name]}
			min={adjustmentMinimums[name] ?? -adjustmentLimits[name]}
			max={adjustmentLimits[name]}
		/>
	);
}

function AdjustmentSection({
	title,
	children,
}: {
	title: string;
	children: ReactNode;
}) {
	return (
		<details open className="p-4 shadow-ridge">
			<summary className="cursor-pointer text-sm text-neutral-300 outline-none focus-visible:ring-1 focus-visible:ring-neutral-100/50">
				{title}
			</summary>
			<div className="mt-3 flex flex-col gap-2">{children}</div>
		</details>
	);
}

export default function AdjustmentControls() {
	return (
		<>
			<AdjustmentSection title="Light">
				<AdjustmentSlider name="exposure" label="Exposure" step={0.01} />
				<AdjustmentSlider name="contrast" label="Contrast" />
				<AdjustmentSlider name="highlights" label="Highlights" />
				<AdjustmentSlider name="shadows" label="Shadows" />
				<AdjustmentSlider name="whites" label="Whites" />
				<AdjustmentSlider name="blacks" label="Blacks" />
			</AdjustmentSection>
			<AdjustmentSection title="Color">
				<AdjustmentSlider
					name="incrementalTemperature"
					label="Temp"
					stops={stops.incrementalTemperature}
				/>
				<AdjustmentSlider
					name="incrementalTint"
					label="Tint"
					stops={stops.incrementalTint}
				/>
				<AdjustmentSlider
					name="vibrance"
					label="Vibrance"
					stops={stops.saturation}
				/>
				<AdjustmentSlider
					name="saturation"
					label="Saturation"
					stops={stops.saturation}
				/>
			</AdjustmentSection>
			<AdjustmentSection title="Details">
				<AdjustmentSlider name="clarity" label="Clarity" />
				<AdjustmentSlider name="sharpening" label="Sharpening" />
				<AdjustmentSlider name="sharpenRadius" label="Radius" step={0.1} />
			</AdjustmentSection>
		</>
	);
}
