import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { setNoiseReduction } from "./edits";

export function NoiseReductionControls() {
	const document = useDocument();
	const amount = useScene((scene) => scene.noiseReduction ?? 0);
	return (
		<Slider
			label="Noise reduction"
			value={amount}
			min={0}
			max={100}
			defaultValue={0}
			onChange={(value) => setNoiseReduction(document, value)}
		/>
	);
}
