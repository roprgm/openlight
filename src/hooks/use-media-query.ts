import { useCallback, useSyncExternalStore } from "react";

/**
 * Whether a media query matches, read during render. The browser reports a change before it paints,
 * and a store update renders synchronously, so the tree switches in the same frame as CSS.
 */
export function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => matchMedia(query).matches);
}
