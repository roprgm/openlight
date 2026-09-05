import type { ComponentProps } from "react";
import { setAdjustments } from "@/app/document/edits";
import { useDocument } from "@/app/document/provider";
import {
	type Adjustments,
	adjustmentLimits,
	defaultAdjustments,
	type ImageLayer,
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
	layer: ImageLayer;
};

function AdjustmentSlider({ name, layer, ...props }: AdjustmentSliderProps) {
	const value = layer.adjustments[name];
	const document = useDocument();
	return (
		<Slider
			{...props}
			value={value}
			onChange={(value) =>
				setAdjustments(document, { [name]: value }, layer.id)
			}
			defaultValue={defaultAdjustments[name]}
			min={-adjustmentLimits[name]}
			max={adjustmentLimits[name]}
		/>
	);
}

export default function AdjustmentControls({ layer }: { layer: ImageLayer }) {
	return (
		<section className="flex flex-col gap-2 p-4 shadow-ridge">
			<AdjustmentSlider
				layer={layer}
				name="exposure"
				label="Exposure"
				step={0.01}
			/>
			<AdjustmentSlider
				layer={layer}
				name="incrementalTemperature"
				label="Temp"
				stops={stops.incrementalTemperature}
			/>
			<AdjustmentSlider
				layer={layer}
				name="incrementalTint"
				label="Tint"
				stops={stops.incrementalTint}
			/>
			<AdjustmentSlider layer={layer} name="contrast" label="Contrast" />
			<AdjustmentSlider layer={layer} name="highlights" label="Highlights" />
			<AdjustmentSlider layer={layer} name="shadows" label="Shadows" />
			<AdjustmentSlider layer={layer} name="whites" label="Whites" />
			<AdjustmentSlider layer={layer} name="blacks" label="Blacks" />
			<AdjustmentSlider
				layer={layer}
				name="vibrance"
				label="Vibrance"
				stops={stops.saturation}
			/>
			<AdjustmentSlider
				layer={layer}
				name="saturation"
				label="Saturation"
				stops={stops.saturation}
			/>
		</section>
	);
}
