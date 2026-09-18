import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

import { useDocument } from "@/components/editor/session";

const GradientTool = createContext<{
	target: string | null;
	draw: (target?: string) => void;
	close: () => void;
} | null>(null);

export function useGradientTool() {
	const tool = useContext(GradientTool);
	if (!tool) {
		throw new Error("A gradient tool provider is required.");
	}
	return tool;
}

export function GradientProvider({ children }: { children: ReactNode }) {
	const [target, setTarget] = useState<string | null>(null);
	const document = useDocument();
	useEffect(
		() => document.selection.subscribe(() => setTarget(null)),
		[document],
	);
	return (
		<GradientTool
			value={{
				target,
				draw: (id = "new") => setTarget(id),
				close: () => setTarget(null),
			}}
		>
			{children}
		</GradientTool>
	);
}
