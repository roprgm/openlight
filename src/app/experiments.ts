const key = "openlight.experiments";

/**
 * Experiments are opted into by hand and remembered by the browser: `?experiment=ai-remove` turns one on
 * and `?experiment=-ai-remove` turns it off. The app composes an enabled experiment's feature; nothing else reads them.
 */
export function experiments(): ReadonlySet<string> {
  const stored = new Set(
    (localStorage.getItem(key) ?? "").split(",").filter(Boolean),
  );
  for (const change of new URLSearchParams(location.search).getAll(
    "experiment",
  )) {
    if (change.startsWith("-")) stored.delete(change.slice(1));
    else if (change) stored.add(change);
  }
  localStorage.setItem(key, [...stored].join(","));
  return stored;
}
