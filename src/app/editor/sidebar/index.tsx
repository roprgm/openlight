import ResizablePanel from "@/components/ui/resizable-panel";
import AdjustmentControls from "./adjustment-controls";
import Histogram from "./histogram";

export default function Sidebar() {
	return (
		<ResizablePanel>
			<div className="flex flex-col divide-y divide-black">
				<section className="bg-neutral-900 p-0.5 pb-0">
					<Histogram />
				</section>
				<AdjustmentControls />
			</div>
		</ResizablePanel>
	);
}
