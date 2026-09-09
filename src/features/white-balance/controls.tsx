import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { setAdjustments } from "@/lib/editor/document/edits";
import { adjustmentLimits, defaultAdjustments } from "@/lib/editor/scene";
import {
	temperatureRange,
	tintRange,
	type WhiteBalance,
} from "@/lib/image-source";
import { setWhiteBalance } from "./edits";

function AbsoluteWhiteBalanceControls({ asShot }: { asShot: WhiteBalance }) {
	const document = useDocument();
	const balance = useScene((scene) => scene.whiteBalance) ?? asShot;
	const unchanged =
		balance.temperature === asShot.temperature && balance.tint === asShot.tint;
	return (
		<>
			<div className="flex items-center justify-between text-neutral-400 text-xs">
				<span>White balance</span>
				<button
					type="button"
					className="cursor-pointer hover:text-neutral-100 disabled:cursor-default disabled:opacity-50"
					disabled={unchanged}
					onClick={() => setWhiteBalance(document)}
				>
					As Shot
				</button>
			</div>
			<Slider
				label="Temperature (K)"
				value={balance.temperature}
				min={Math.min(temperatureRange[0], asShot.temperature)}
				max={Math.max(temperatureRange[1], asShot.temperature)}
				defaultValue={asShot.temperature}
				stops={["#4a6fc3", "#c3b84a"]}
				onChange={(temperature) => setWhiteBalance(document, { temperature })}
			/>
			<Slider
				label="Tint"
				value={balance.tint}
				step={0.1}
				min={Math.min(tintRange[0], asShot.tint)}
				max={Math.max(tintRange[1], asShot.tint)}
				defaultValue={asShot.tint}
				stops={["#5ab34a", "#b34ab3"]}
				onChange={(tint) => setWhiteBalance(document, { tint })}
			/>
		</>
	);
}

function RelativeWhiteBalanceControls() {
	const document = useDocument();
	const temperature = useScene(
		(scene) => scene.adjustments.incrementalTemperature,
	);
	const tint = useScene((scene) => scene.adjustments.incrementalTint);
	return (
		<>
			<Slider
				label="Temp"
				value={temperature}
				min={-adjustmentLimits.incrementalTemperature}
				max={adjustmentLimits.incrementalTemperature}
				defaultValue={defaultAdjustments.incrementalTemperature}
				stops={["#4a6fc3", "#c3b84a"]}
				onChange={(incrementalTemperature) =>
					setAdjustments(document, { incrementalTemperature })
				}
			/>
			<Slider
				label="Tint"
				value={tint}
				min={-adjustmentLimits.incrementalTint}
				max={adjustmentLimits.incrementalTint}
				defaultValue={defaultAdjustments.incrementalTint}
				stops={["#5ab34a", "#b34ab3"]}
				onChange={(incrementalTint) =>
					setAdjustments(document, { incrementalTint })
				}
			/>
		</>
	);
}

export function WhiteBalanceControls() {
	const document = useDocument();
	const source = useScene((scene) => scene.source);
	const whiteBalance = document.resources.get(source).whiteBalance;
	if (whiteBalance)
		return <AbsoluteWhiteBalanceControls asShot={whiteBalance.asShot} />;
	return <RelativeWhiteBalanceControls />;
}
