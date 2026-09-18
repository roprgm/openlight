import { useDocument, useScene } from "@/components/editor/session";
import { Collapsible } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import { setVignette } from "./edits";
import { defaultVignette } from "./model";

export function VignetteControls() {
	const document = useDocument();
	const vignette = useScene((scene) => scene.vignette ?? defaultVignette);
	return (
		<Collapsible title="Vignette">
			<div className="flex flex-col gap-2">
				<Slider
					label="Intensity"
					value={vignette.intensity}
					onChange={(intensity) => setVignette(document, { intensity })}
					min={0}
					max={100}
					defaultValue={defaultVignette.intensity}
				/>
				<Slider
					label="Softness"
					value={vignette.softness}
					onChange={(softness) => setVignette(document, { softness })}
					min={0}
					max={100}
					defaultValue={defaultVignette.softness}
				/>
			</div>
		</Collapsible>
	);
}
