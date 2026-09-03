import { adjustmentLimits, defaultAdjustments, useScene } from "@/app/scene";
import { Slider } from "@/components/ui/slider";

const stops = {
	temp: ["#4a6fc3", "#c3b84a"],
	tint: ["#5ab34a", "#b34ab3"],
	saturation: [
		"#7b7d85",
		"#868686 50%",
		"#7fa066 68%",
		"#b8a75c 84%",
		"#c25a48",
	],
};

export default function AdjustmentControls() {
	const value = useScene((scene) => scene.adjustments);
	const onChange = useScene((scene) => scene.setAdjustments);
	return (
		<section className="flex flex-col gap-3 p-4 shadow-ridge">
			<Slider
				defaultValue={defaultAdjustments.exposure}
				label="Exposure"
				max={adjustmentLimits.exposure}
				min={-adjustmentLimits.exposure}
				onChange={(exposure) => onChange({ exposure })}
				step={0.01}
				value={value.exposure}
			/>
			<Slider
				defaultValue={defaultAdjustments.temp}
				label="Temp"
				max={adjustmentLimits.temp}
				min={-adjustmentLimits.temp}
				onChange={(temp) => onChange({ temp })}
				stops={stops.temp}
				value={value.temp}
			/>
			<Slider
				defaultValue={defaultAdjustments.tint}
				label="Tint"
				max={adjustmentLimits.tint}
				min={-adjustmentLimits.tint}
				onChange={(tint) => onChange({ tint })}
				stops={stops.tint}
				value={value.tint}
			/>
			<Slider
				defaultValue={defaultAdjustments.contrast}
				label="Contrast"
				max={adjustmentLimits.contrast}
				min={-adjustmentLimits.contrast}
				onChange={(contrast) => onChange({ contrast })}
				value={value.contrast}
			/>
			<Slider
				defaultValue={defaultAdjustments.vibrance}
				label="Vibrance"
				max={adjustmentLimits.vibrance}
				min={-adjustmentLimits.vibrance}
				onChange={(vibrance) => onChange({ vibrance })}
				stops={stops.saturation}
				value={value.vibrance}
			/>
			<Slider
				defaultValue={defaultAdjustments.saturation}
				label="Saturation"
				max={adjustmentLimits.saturation}
				min={-adjustmentLimits.saturation}
				onChange={(saturation) => onChange({ saturation })}
				stops={stops.saturation}
				value={value.saturation}
			/>
		</section>
	);
}
