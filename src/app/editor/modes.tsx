import { createContext, type ReactNode, useContext, useState } from "react";
import { PanelContent } from "@/components/editor/session";
import { AdjustIcon } from "@/components/icons/adjust";
import { CropIcon } from "@/components/icons/crop";
import { ExportIcon } from "@/components/icons/export";
import { LayersIcon } from "@/components/icons/layers";
import { RetouchIcon } from "@/components/icons/retouch";
import { CropEditor } from "@/features/crop/view";
import { EditorActions } from "./actions";
import { AdjustPanel } from "./adjust";
import { ExportMode } from "./export";

const ModeContext = createContext<{
	mode: Mode;
	setMode: (mode: Mode) => void;
} | null>(null);

export function useMode() {
	const context = useContext(ModeContext);
	if (!context) {
		throw new Error("A mode provider is required.");
	}
	return context;
}

function PlaceholderPanel() {
	return (
		<PanelContent>
			<div className="flex min-h-0 flex-1 flex-col divide-y divide-black">
				<p className="grid flex-1 place-items-center text-neutral-500 text-sm">
					Coming soon
				</p>
				<EditorActions />
			</div>
		</PanelContent>
	);
}

const adjust = {
	id: "adjust",
	label: "Adjust",
	key: "a",
	Icon: AdjustIcon,
	group: "edit",
	Panel: AdjustPanel,
} as const;

function CropMode() {
	const { setMode } = useMode();
	return <CropEditor onClose={() => setMode(adjust)} />;
}

/**
 * A mode edits over the shared canvas through a Panel, or brings its own View when it needs another viewport.
 * Output modes sit at the end of the rail, apart from editing modes.
 */
export const modes = [
	adjust,
	{
		id: "layers",
		label: "Layers",
		key: "l",
		Icon: LayersIcon,
		group: "edit",
		Panel: PlaceholderPanel,
	},
	{
		id: "retouch",
		label: "Retouch",
		key: "r",
		Icon: RetouchIcon,
		group: "edit",
		Panel: PlaceholderPanel,
	},
	{
		id: "crop",
		label: "Crop",
		key: "c",
		Icon: CropIcon,
		group: "edit",
		View: CropMode,
	},
	{
		id: "export",
		label: "Export",
		key: "e",
		Icon: ExportIcon,
		group: "output",
		View: ExportMode,
	},
] as const;

export type Mode = (typeof modes)[number];

export function ModeProvider({ children }: { children: ReactNode }) {
	const [mode, setMode] = useState<Mode>(adjust);
	return <ModeContext value={{ mode, setMode }}>{children}</ModeContext>;
}
