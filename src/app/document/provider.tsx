import { createContext, useContext } from "react";
import { useStore } from "zustand";
import type { Scene } from "@/app/scene";
import type { EditorDocument } from "./index";

export const DocumentProvider = createContext<EditorDocument | null>(null);

export function useDocument() {
	const document = useContext(DocumentProvider);
	if (!document) {
		throw new Error("useDocument requires DocumentProvider.");
	}
	return document;
}

export function useScene<T>(selector: (scene: Scene) => T) {
	return useStore(useDocument().scene, selector);
}
