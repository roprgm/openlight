import type { ComponentProps, ReactNode } from "react";
import { useDocument, useScene } from "@/components/editor/session";
import { Collapsible } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { WhiteBalanceControls } from "@/features/white-balance/controls";
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

function ColorTemperatureControls() {
	const document = useDocument();
	const source = useScene((scene) => scene.source);
	if (document.resources.get(source).raw) {
		return <WhiteBalanceControls />;
	}
	return (
		<>
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
		</>
	);
}

export default function AdjustmentControls({ curves }: { curves: ReactNode }) {
	return (
		<>
			<Collapsible title="Light">
				<div className="flex flex-col gap-2">
					<AdjustmentSlider name="exposure" label="Exposure" step={0.01} />
					<AdjustmentSlider name="contrast" label="Contrast" />
					<AdjustmentSlider name="highlights" label="Highlights" />
					<AdjustmentSlider name="shadows" label="Shadows" />
					<AdjustmentSlider name="whites" label="Whites" />
					<AdjustmentSlider name="blacks" label="Blacks" />
				</div>
				<div className="pt-3">{curves}</div>
			</Collapsible>
			<Collapsible title="Color">
				<div className="flex flex-col gap-2">
					<ColorTemperatureControls />
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
				</div>
			</Collapsible>
			<Collapsible title="Details">
				<div className="flex flex-col gap-2">
					<AdjustmentSlider name="clarity" label="Clarity" />
					<AdjustmentSlider name="sharpening" label="Sharpening" />
					<AdjustmentSlider name="sharpenRadius" label="Radius" step={0.1} />
				</div>
			</Collapsible>
		</>
	);
}
