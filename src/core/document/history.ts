import { createStore, type StoreApi } from "zustand/vanilla";

/** Bounded immutable snapshots, grouped explicitly by an editing gesture. */
export function createHistory<T extends object>(
	state: StoreApi<T>,
	equal: (a: T, b: T) => boolean,
	limit = 100,
	onChange?: (retained: readonly T[]) => void,
) {
	const status = createStore(() => ({ undoCount: 0, redoCount: 0 }));
	const past: T[] = [];
	const future: T[] = [];
	let group: T | undefined;
	function publish() {
		status.setState({ undoCount: past.length, redoCount: future.length });
		onChange?.([
			...past,
			...future,
			...(group ? [group] : []),
			state.getState(),
		]);
	}
	function record(before: T) {
		if (equal(before, state.getState())) {
			return;
		}
		past.push(before);
		if (past.length > limit) {
			past.shift();
		}
		future.length = 0;
	}
	function commit() {
		const before = group;
		group = undefined;
		if (before !== undefined) {
			record(before);
			publish();
		}
	}
	function cancel() {
		const before = group;
		group = undefined;
		if (before !== undefined) {
			state.setState(before, true);
			publish();
		}
	}
	function travel(from: T[], to: T[]) {
		commit();
		const next = from.pop();
		if (next === undefined) {
			return;
		}
		to.push(state.getState());
		state.setState(next, true);
		publish();
	}
	return {
		status: {
			getState: status.getState,
			getInitialState: status.getInitialState,
			subscribe: status.subscribe,
		},
		update(next: T) {
			const before = state.getState();
			if (equal(before, next)) {
				return;
			}
			state.setState(next, true);
			if (!group) {
				record(before);
			}
			publish();
		},
		begin() {
			group ??= state.getState();
		},
		commit,
		cancel,
		undo: () => travel(past, future),
		redo: () => travel(future, past),
		clear() {
			group = undefined;
			past.length = future.length = 0;
			publish();
		},
	};
}
