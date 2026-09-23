import { type DependencyList, useEffect, useMemo } from "react";

/**
 * A resource created for the current dependencies and disposed when they change or the component unmounts.
 * Every owner goes through here, so a change to how React keeps memoized values has one place to adapt.
 */
export function useDisposable<T extends { dispose(): void }>(
  create: () => T,
  deps: DependencyList,
) {
  const value = useMemo(create, deps);
  useEffect(() => () => value.dispose(), [value]);
  return value;
}
