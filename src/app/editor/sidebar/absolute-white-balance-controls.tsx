import { useDocument, useScene } from "@/components/editor/session";
import { Slider } from "@/components/ui/slider";
import { setWhiteBalance } from "@/lib/editor/document/edits";
import {
	temperatureRange,
	tintRange,
	type WhiteBalance,
} from "@/lib/white-balance";

export function AbsoluteWhiteBalanceControls({
	asShot,
}: {
	asShot: WhiteBalance;
}) {
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
