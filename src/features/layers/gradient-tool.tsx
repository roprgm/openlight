import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useDocument } from "@/components/editor/session";
import { findLayer, type Gradient, type MaskLayer } from "@/core/document";

type NewMask = {
	kind: "new";
	shape: Gradient["kind"];
	parentId?: string;
	operation: "add" | "subtract";
};

/** "new" previews a just-drawn mask until Enter, Escape, or its first adjustment. */
type Overlay = "hidden" | "shown" | "new";

const GradientTool = createContext<{
	target: NewMask | null;
	overlay: Overlay;
	draw: (shape?: Gradient["kind"]) => void;
	add: (
		parentId: string,
		operation: "add" | "subtract",
		shape: Gradient["kind"],
	) => void;
	close: () => void;
	create: (mask: Gradient, target: NewMask) => void;
	setOverlay: (overlay: Overlay) => void;
} | null>(null);

export function useGradientTool() {
	const tool = useContext(GradientTool);
	if (!tool) {
		throw new Error("A gradient tool provider is required.");
	}
	return tool;
}

/** Geometry edits keep the preview; effect edits end it. */
function adjusted(before: MaskLayer, after: MaskLayer) {
	return (
		before.adjustments !== after.adjustments ||
		before.children !== after.children ||
		before.opacity !== after.opacity
	);
}

export function GradientProvider({
	children,
	onCreate,
}: {
	children: ReactNode;
	onCreate: (mask: Gradient, target: NewMask) => void;
}) {
	const [target, setTarget] = useState<NewMask | null>(null);
	const [overlay, setOverlay] = useState<Overlay>("hidden");
	const document = useDocument();
	useEffect(
		() =>
			document.selection.subscribe(() => {
				setTarget(null);
				setOverlay("hidden");
			}),
		[document],
	);
	useEffect(
		() =>
			document.scene.subscribe((scene, previous) => {
				const id = document.selection.getState().layerId;
				const before = findLayer(previous.layers, id);
				const after = findLayer(scene.layers, id);
				if (
					before?.kind === "mask" &&
					after?.kind === "mask" &&
					adjusted(before, after)
				) {
					setOverlay("hidden");
				}
			}),
		[document],
	);
	return (
		<GradientTool
			value={{
				target,
				overlay,
				draw: (shape = "linear") =>
					setTarget({ kind: "new", shape, operation: "add" }),
				add: (parentId, operation, shape) =>
					setTarget({ kind: "new", shape, parentId, operation }),
				close: () => setTarget(null),
				create: (mask, target) => {
					onCreate(mask, target);
					setOverlay("new");
				},
				setOverlay,
			}}
		>
			{children}
		</GradientTool>
	);
}
