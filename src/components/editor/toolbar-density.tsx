import { createContext, useContext } from "react";

/** How much room the bar has: sliders with bars, fields only, or a column inside the overflow menu. */
export type BarDensity = "full" | "compact" | "menu";
export const Density = createContext<BarDensity>("full");
export function useBarDensity() {
  return useContext(Density);
}
export function barSlider(density: BarDensity) {
  if (density === "menu") {
    return "panel";
  }
  return density === "full" ? "toolbar" : "compact";
}
