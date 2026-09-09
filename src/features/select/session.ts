import type { Gpu, Target } from "vgpu";
import { createStore } from "zustand/vanilla";
import type { EditorDocument } from "@/lib/editor/document";
import { frameValues } from "@/lib/image-frame/geometry";
import { defaultOptions, type Operation, type SelectionOptions } from "./cost";
import { createSelectionEngine } from "./engine";

type SelectionState = {
	open: boolean;
	status: "idle" | "preparing" | "ready" | "preview" | "growing" | "error";
	options: SelectionOptions;
	count: number;
	bounds: number[] | null;
	error: string | null;
};

function createSelection(gpu: Gpu, document: EditorDocument) {
	const state = createStore<SelectionState>(() => ({
		open: false,
		status: "idle",
		options: defaultOptions,
		count: 0,
		bounds: null,
		error: null,
	}));
	let engine: ReturnType<typeof createSelectionEngine> | undefined;
	let generation = 0;
	function clear() {
		generation++;
		engine?.clear();
		state.setState({ count: 0, bounds: null, status: "idle" });
	}
	function cancel() {
		generation++;
		engine?.cancel();
		state.setState({ status: "ready" });
	}
	function fail(error: unknown) {
		engine?.cancel();
		state.setState({ status: "error", error: String(error) });
	}
	async function commit() {
		const request = ++generation;
		state.setState({ status: "growing" });
		try {
			const result = await engine?.commit();
			if (request !== generation) return false;
			state.setState({ ...result, status: "ready" });
			return result !== null && result !== undefined;
		} catch (error) {
			if (request === generation) fail(error);
			return false;
		}
	}
	function begin(
		point: readonly [number, number],
		operation: Operation = "replace",
	) {
		const { open, status } = state.getState();
		if (!open || !engine || status === "preparing" || status === "error")
			throw new Error("Wait for the Magic Wand image to be ready.");
		if (!["replace", "add", "subtract", "intersect"].includes(operation))
			throw new Error("Invalid selection operation.");
		generation++;
		engine.begin(point, state.getState().options, operation);
		state.setState({ status: "preview", error: null });
	}
	const selection = {
		state,
		engine: () => engine,
		enter() {
			if (!state.getState().open)
				state.setState({ open: true, status: "preparing" });
		},
		close() {
			cancel();
			state.setState({ open: false });
		},
		async prepare(image: Target) {
			const request = ++generation;
			state.setState({ status: "preparing", error: null });
			try {
				engine ??= createSelectionEngine(gpu);
				await engine.prepare(image);
				if (request === generation) state.setState({ status: "ready" });
			} catch (error) {
				if (request === generation) fail(error);
			}
		},
		begin,
		commit,
		async selectAt(point: readonly [number, number], operation?: Operation) {
			begin(point, operation);
			await commit();
		},
		configure(change: Partial<SelectionOptions>) {
			const options = { ...state.getState().options, ...change };
			if (
				!Number.isFinite(options.tolerance) ||
				options.tolerance < 0.01 ||
				options.tolerance > 2 ||
				![1, 3, 5].includes(options.sampleSize) ||
				typeof options.contiguous !== "boolean" ||
				!Number.isFinite(options.feather) ||
				options.feather < 0 ||
				options.feather > 20
			)
				throw new Error("Invalid Magic Wand options.");
			state.setState({ options });
			if (state.getState().status === "preview") engine?.change(options);
		},
		cancel,
		clear,
		escape() {
			if (["preview", "growing"].includes(state.getState().status)) cancel();
			else clear();
		},
	};
	const unsubscribe = document.scene.subscribe((next, previous) => {
		const before = frameValues(previous.frame);
		if (
			next.source !== previous.source ||
			frameValues(next.frame).some((n, i) => n !== before[i])
		)
			clear();
	});
	document.resources.own({
		dispose() {
			generation++;
			unsubscribe();
			engine?.dispose();
		},
	});
	return selection;
}

export type Selection = ReturnType<typeof createSelection>;
const selections = new WeakMap<EditorDocument, Selection>();

/** Feature state is document-owned through resource cleanup, outside Scene and its history. */
export function getSelection(gpu: Gpu, document: EditorDocument) {
	let selection = selections.get(document);
	if (!selection) {
		selection = createSelection(gpu, document);
		selections.set(document, selection);
	}
	return selection;
}
