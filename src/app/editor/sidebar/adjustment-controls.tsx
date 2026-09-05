import type { ComponentProps } from "react";
import {
	type Adjustments,
	adjustmentLimits,
	defaultAdjustments,
	useScene,
} from "@/app/scene";
import { Slider } from "@/components/ui/slider";

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
	const onChange = useScene((scene) => scene.setAdjustments);
	return (
		<Slider
			{...props}
			value={value}
			onChange={(value) => onChange({ [name]: value })}
			defaultValue={defaultAdjustments[name]}
			min={-adjustmentLimits[name]}
			max={adjustmentLimits[name]}
		/>
	);
}

export default function AdjustmentControls() {
	return (
		<section className="flex flex-col gap-2 p-4 shadow-ridge">
			<AdjustmentSlider name="exposure" label="Exposure" step={0.01} />
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
			<AdjustmentSlider name="contrast" label="Contrast" />
			<AdjustmentSlider name="highlights" label="Highlights" />
			<AdjustmentSlider name="shadows" label="Shadows" />
			<AdjustmentSlider name="whites" label="Whites" />
			<AdjustmentSlider name="blacks" label="Blacks" />
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
		</section>
	);
}
