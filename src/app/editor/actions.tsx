import { ComparisonControl } from "./comparison-control";
import { HistoryControls } from "./history";

/** Document actions shared by mode panels. */
export function EditorActions() {
	return (
		<div className="flex shrink-0 items-center gap-2 bg-panel p-3">
			<HistoryControls />
			<ComparisonControl />
		</div>
	);
}
