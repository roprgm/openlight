import { createStore, type StoreApi } from "zustand/vanilla";

/** Bounded immutable snapshots, grouped explicitly by an editing gesture. */
export function createHistory<T extends object>(
  state: StoreApi<T>,
  equal: (a: T, b: T) => boolean,
  limit = 100,
  onChange?: (retained: readonly T[]) => void,
) {
  const status = createStore(() => ({
    undoCount: 0,
    redoCount: 0,
    /** A gesture group is open, so the scene is mid-change. */
    editing: false,
  }));
  const past: T[] = [];
  const future: T[] = [];
  let group: T | undefined;
  function publish() {
    status.setState({
      undoCount: past.length,
      redoCount: future.length,
      editing: group !== undefined,
    });
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
    /** Returns whether this call opened the group; nested callers leave it to the opener. */
    begin() {
      const opened = group === undefined;
      group ??= state.getState();
      if (opened) {
        status.setState({ editing: true });
      }
      return opened;
    },
    commit,
    cancel,
    undo: () => travel(past, future),
    redo: () => travel(future, past),
    /** Removes the latest entry as if it never happened: no redo, and an open group is cancelled. */
    drop() {
      cancel();
      const previous = past.pop();
      if (previous === undefined) {
        return;
      }
      state.setState(previous, true);
      future.length = 0;
      publish();
    },
    clear() {
      group = undefined;
      past.length = future.length = 0;
      publish();
    },
  };
}
