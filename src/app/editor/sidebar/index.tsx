import ResizablePanel from "@/components/ui/resizable-panel";
import AdjustmentControls from "./adjustment-controls";
import Curves from "./curves";
import ExportButton from "./export-button";
import Histogram from "./histogram";

export default function Sidebar() {
	return (
		<ResizablePanel>
			<div className="flex h-full flex-col divide-y divide-black">
				<div className="min-h-0 flex-1 divide-y divide-black overflow-y-auto">
					<section className="bg-neutral-900 p-0.5 pb-0">
						<Histogram />
					</section>
					<AdjustmentControls />
					<Curves />
				</div>
				<ExportButton />
			</div>
		</ResizablePanel>
	);
}
