import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useDocument } from "@/components/editor/session";
import type { Gradient } from "@/core/document";

type NewMask = {
	kind: "new";
	shape: Gradient["kind"];
	parentId?: string;
	operation: "add" | "subtract";
};

const GradientTool = createContext<{
	target: NewMask | null;
	draw: (shape?: Gradient["kind"]) => void;
	add: (
		parentId: string,
		operation: "add" | "subtract",
		shape: Gradient["kind"],
	) => void;
	close: () => void;
	create: (mask: Gradient, target: NewMask) => void;
} | null>(null);

export function useGradientTool() {
	const tool = useContext(GradientTool);
	if (!tool) {
		throw new Error("A gradient tool provider is required.");
	}
	return tool;
}

export function GradientProvider({
	children,
	onCreate,
}: {
	children: ReactNode;
	onCreate: (mask: Gradient, target: NewMask) => void;
}) {
	const [target, setTarget] = useState<NewMask | null>(null);
	const document = useDocument();
	useEffect(
		() => document.selection.subscribe(() => setTarget(null)),
		[document],
	);
	return (
		<GradientTool
			value={{
				target,
				draw: (shape = "linear") =>
					setTarget({ kind: "new", shape, operation: "add" }),
				add: (parentId, operation, shape) =>
					setTarget({ kind: "new", shape, parentId, operation }),
				close: () => setTarget(null),
				create: onCreate,
			}}
		>
			{children}
		</GradientTool>
	);
}
