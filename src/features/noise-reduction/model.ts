import { range } from "@/lib/parse";

/** How far a RAW photo develops toward its noise-reduced samples, in UI units; 0 develops them as decoded. */
export const noiseReductionSchema = range(0, 100);
