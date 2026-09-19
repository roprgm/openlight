import { ComparisonControl } from "./comparison-control";
import { HistoryControls } from "./history";

/** Document actions shared by mode panels. */
export function EditorActions() {
	return (
		<footer className="flex shrink-0 items-center gap-2 border-t border-black bg-panel p-3 shadow-ridge">
			<HistoryControls />
			<ComparisonControl />
		</footer>
	);
}
