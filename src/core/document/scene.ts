import type { WhiteBalance } from "@/core/image";
import type { ImageFrame, Point } from "@/core/image/frame";

export type Adjustments = {
  exposure: number;
  incrementalTemperature: number;
  incrementalTint: number;
  contrast: number;
  highlights: number;
  shadows: number;
  whites: number;
  blacks: number;
  vibrance: number;
  saturation: number;
};

export type Details = {
  clarity: number;
  sharpening: number;
  sharpenRadius: number;
};

export type CurvePoint = { readonly x: number; readonly y: number };
export type ToneCurve = readonly CurvePoint[];

/** Eight color ranges, ordered red through magenta; values use -100..100 UI units. */
export type ColorMixer = {
  readonly hue: readonly number[];
  readonly saturation: readonly number[];
  readonly luminance: readonly number[];
};

/** Source-centered darkening in 0..100 UI units. */
export type Vignette = {
  readonly intensity: number;
  readonly softness: number;
};

export type ImageLayer = {
  readonly kind: "image";
  readonly id: string;
  readonly name: string;
  readonly source: string;
  readonly whiteBalance?: Readonly<WhiteBalance>;
  readonly adjustments: Readonly<Adjustments>;
  readonly toneCurve: ToneCurve;
  readonly children: readonly ProcessingLayer[];
};

/** Endpoints in the original document canvas, independent of crop and rotation. */
export type LinearGradient = {
  readonly kind: "linear";
  readonly start: Point;
  readonly end: Point;
};
export type RadialGradient = {
  readonly kind: "radial";
  readonly center: Point;
  readonly radius: Point;
  readonly angle: number;
  readonly feather: number;
};
export type Gradient = LinearGradient | RadialGradient;
export type ProcessingLayer = {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly children: readonly ProcessingLayer[];
} & (
  | { readonly kind: "details"; readonly details: Readonly<Details> }
  | { readonly kind: "exposure"; readonly exposure: number }
  | { readonly kind: "vignette"; readonly vignette: Vignette }
  | { readonly kind: "color-mixer"; readonly colorMixer: ColorMixer }
  | {
      readonly kind: "mask";
      readonly operation: "add" | "subtract";
      readonly mask: Gradient;
      readonly adjustments: Readonly<Adjustments>;
      readonly toneCurve: ToneCurve;
    }
);
export type MaskLayer = Extract<ProcessingLayer, { kind: "mask" }>;
/** A child mask that adds to or subtracts from its parent's coverage. */
export type MaskModifier = Pick<MaskLayer, "mask" | "operation" | "opacity">;
export type EffectLayer = Exclude<ProcessingLayer, MaskLayer>;
export type Layer = ImageLayer | ProcessingLayer;

/** The sole image source is pinned below the ordered processing tree. */
export type Scene = {
  readonly frame: ImageFrame;
  readonly layers: readonly [ImageLayer, ...ProcessingLayer[]];
};
