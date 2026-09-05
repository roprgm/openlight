import { createStore } from "zustand/vanilla";
import type { EditorDocument } from "@/app/document";

type WorkspaceState =
	| { status: "empty"; file?: undefined; document?: undefined }
	| { status: "loading"; file: string; document?: undefined }
	| { status: "error"; file: string; error: string; document?: undefined }
	| { status: "ready"; file: string; document: EditorDocument };

/** Single-document policy; document instances remain independent of this session. */
export function createWorkspace() {
	const state = createStore<WorkspaceState>(() => ({ status: "empty" }));
	let generation = 0;
	let closed = false;
	return {
		state: {
			getState: state.getState,
			getInitialState: state.getInitialState,
			subscribe: state.subscribe,
		},
		getDocument() {
			const document = state.getState().document;
			if (!document) {
				throw new Error("Load an image before editing.");
			}
			return document;
		},
		async open(file: string, load: () => Promise<EditorDocument>) {
			if (closed) {
				throw new Error("Workspace is closed.");
			}
			const request = ++generation;
			const previous = state.getState().document;
			state.setState({ status: "loading", file }, true);
			previous?.dispose();
			try {
				const document = await load();
				if (request !== generation) {
					document.dispose();
					return;
				}
				state.setState({ status: "ready", file, document }, true);
			} catch (error) {
				if (request === generation) {
					state.setState({ status: "error", file, error: String(error) }, true);
				}
			}
		},
		dispose() {
			closed = true;
			generation++;
			state.getState().document?.dispose();
			state.setState({ status: "empty" }, true);
		},
	};
}
export type Workspace = ReturnType<typeof createWorkspace>;
