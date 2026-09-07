import {
	createContext,
	type ReactNode,
	useContext,
	useMemo,
	useState,
} from "react";
import { useStore } from "zustand";
import ResizablePanel from "@/components/ui/resizable-panel";
import { createCamera } from "@/hooks/use-pan-zoom";
import type { EditorDocument } from "@/lib/editor/document";
import type { Scene } from "@/lib/editor/scene";

const Session = createContext<{
	document: EditorDocument;
	camera: ReturnType<typeof createCamera>;
	width: number;
	onWidthChange: (width: number) => void;
} | null>(null);

export function useEditorSession() {
	const session = useContext(Session);
	if (!session) {
		throw new Error("An editor session is required.");
	}
	return session;
}
export function useDocument() {
	return useEditorSession().document;
}
export function useScene<T>(selector: (scene: Scene) => T) {
	return useStore(useDocument().scene, selector);
}

/** Preserve document UI state while independent tools mount and unmount. */
export function DocumentProvider({
	value,
	children,
}: {
	value: EditorDocument;
	children: ReactNode;
}) {
	const size = useStore(value.scene, (scene) => scene.frame.size);
	const camera = useMemo(createCamera, [size[0], size[1]]);
	const [width, onWidthChange] = useState(288);
	return (
		<Session value={{ document: value, camera, width, onWidthChange }}>
			{children}
		</Session>
	);
}

export function EditorPanel({ children }: { children: ReactNode }) {
	const { width, onWidthChange } = useEditorSession();
	return (
		<ResizablePanel width={width} onWidthChange={onWidthChange}>
			{children}
		</ResizablePanel>
	);
}
