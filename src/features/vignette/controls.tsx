import { useDocument } from "@/components/editor/session";
import { Collapsible } from "@/components/ui/collapsible";
import { Slider } from "@/components/ui/slider";
import type { Vignette } from "@/core/document";
import { setVignette } from "./edits";
import { defaultVignette } from "./model";

export function VignetteControls({
	id,
	vignette,
}: {
	id: string;
	vignette: Vignette;
}) {
	const document = useDocument();
	return (
		<Collapsible title="Vignette">
			<div className="flex flex-col gap-2">
				<Slider
					label="Intensity"
					value={vignette.intensity}
					onChange={(intensity) => setVignette(document, { intensity }, id)}
					min={0}
					max={100}
					defaultValue={defaultVignette.intensity}
				/>
				<Slider
					label="Softness"
					value={vignette.softness}
					onChange={(softness) => setVignette(document, { softness }, id)}
					min={0}
					max={100}
					defaultValue={defaultVignette.softness}
				/>
			</div>
		</Collapsible>
	);
}
