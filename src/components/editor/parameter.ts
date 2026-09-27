import type { DialItem } from "@/components/ui/dial";

/** A number a feature exposes once and each layout draws: a Slider in the sidebar, a Dial in the dock. */
export type Parameter = DialItem & {
  /** Colors painting a slider's bar. */
  stops?: readonly string[];
  /** A slider's minimum digit width, in characters. */
  valueWidth?: number;
};
