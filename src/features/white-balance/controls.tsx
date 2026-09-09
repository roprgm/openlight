import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { setWhiteBalance, whiteBalanceLimits } from "./edits";

export function WhiteBalanceControls() {
	const document = useDocument();
	const source = useScene((scene) => scene.source);
	const selected = useScene((scene) => scene.whiteBalance);
	const asShot = document.resources.get(source).raw?.asShot;
	if (!asShot) {
		return null;
	}
	const balance = selected ?? asShot;
	const limits = whiteBalanceLimits(asShot);
	return (
		<>
			<button
				type="button"
				className="cursor-pointer self-end text-neutral-400 text-xs hover:text-neutral-100"
				onClick={() => setWhiteBalance(document)}
			>
				As Shot
			</button>
			<Slider
				label="Temperature (K)"
				value={balance.temperature}
				{...limits.temperature}
				defaultValue={asShot.temperature}
				onChange={(temperature) => setWhiteBalance(document, { temperature })}
			/>
			<Slider
				label="Tint"
				value={balance.tint}
				step={0.1}
				{...limits.tint}
				defaultValue={asShot.tint}
				onChange={(tint) => setWhiteBalance(document, { tint })}
			/>
		</>
	);
}
