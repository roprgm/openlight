import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";
import { useDocument } from "@/components/editor/session";
import type { LinearGradient } from "@/core/document";

type NewMask = {
	kind: "new";
	parentId?: string;
	operation: "add" | "subtract";
};
type GradientTarget = NewMask | { kind: "edit"; id: string };

const GradientTool = createContext<{
	target: GradientTarget | null;
	draw: (id?: string) => void;
	add: (parentId: string, operation: "add" | "subtract") => void;
	close: () => void;
	create: (mask: LinearGradient, target: NewMask) => void;
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
	onCreate: (mask: LinearGradient, target: NewMask) => void;
}) {
	const [target, setTarget] = useState<GradientTarget | null>(null);
	const document = useDocument();
	useEffect(
		() => document.selection.subscribe(() => setTarget(null)),
		[document],
	);
	return (
		<GradientTool
			value={{
				target,
				draw: (id) => {
					if (id) {
						setTarget({ kind: "edit", id });
					} else {
						setTarget({ kind: "new", operation: "add" });
					}
				},
				add: (parentId, operation) =>
					setTarget({ kind: "new", parentId, operation }),
				close: () => setTarget(null),
				create: onCreate,
			}}
		>
			{children}
		</GradientTool>
	);
}
