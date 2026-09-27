import { cn } from "cn";
import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { EditorDock } from "./dock";
import { EditorPanel } from "./panel";

/** Tailwind's `md` breakpoint, written as its media query, so an `md:` class and this switch agree. */
const desktopQuery = "(width >= 48rem)";

/** The one decision between the two layouts: a sidebar beside the canvas, or a dock under it. */
export function useDesktopLayout() {
  return useMediaQuery(desktopQuery);
}

/**
 * The editor's frame around every view: the tool rail at the left on desktop, the dock's tab bar at
 * the bottom on mobile. It outlives the views, so the rail and the tabs keep focus as tools change.
 */
export function EditorFrame({
  rail,
  tabs,
  children,
}: {
  rail: ReactNode;
  tabs: ReactNode;
  children: ReactNode;
}) {
  const desktop = useDesktopLayout();
  return (
    <div className={cn("flex min-h-0 flex-1", !desktop && "flex-col")}>
      {desktop && rail}
      {children}
      {!desktop && tabs}
    </div>
  );
}

/**
 * A view's canvas and controls in the frame: the sidebar beside the canvas on desktop, the dock under
 * it on mobile. The canvas comes first in both, so crossing the breakpoint moves it without mounting
 * it again; the sidebar and the dock swap. `dock` defaults to `panel`.
 */
export function EditorLayout({
  canvas,
  panel,
  dock = panel,
  inert,
}: {
  canvas: ReactNode;
  panel: ReactNode;
  dock?: ReactNode;
  inert?: boolean;
}) {
  const desktop = useDesktopLayout();
  return (
    <>
      {canvas}
      {desktop ? (
        <EditorPanel inert={inert}>{panel}</EditorPanel>
      ) : (
        <EditorDock inert={inert}>{dock}</EditorDock>
      )}
    </>
  );
}
