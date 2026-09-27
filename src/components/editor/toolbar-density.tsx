import { createContext, useContext } from "react";

/**
 * Where tool options draw and how much room they have: in the bar, sliders with bars or fields only;
 * a column inside its overflow menu; or dials in the mobile dock.
 */
export type BarDensity = "full" | "compact" | "menu" | "dock";
export const Density = createContext<BarDensity>("full");
export function useBarDensity() {
  return useContext(Density);
}
export function barSlider(density: BarDensity) {
  if (density === "menu" || density === "dock") {
    return "panel";
  }
  return density === "full" ? "toolbar" : "compact";
}
