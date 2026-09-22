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

export type Blend =
  | "normal"
  | "multiply"
  | "screen"
  | "overlay"
  | "soft-light"
  | "color"
  | "luminosity";
/** One color painted over the image, as `#rrggbb` sRGB, blended like Photoshop. */
export type Fill = {
  readonly color: string;
  readonly blend: Blend;
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
/** A source-pixel position with the pen pressure that scales flow, 1 for a mouse. */
export type StrokePoint = readonly [number, number, number];
/** One brush drag; paint accumulates coverage by flow and erase removes it. */
export type BrushStroke = {
  readonly mode: "paint" | "erase";
  /** Diameter in source pixels. */
  readonly size: number;
  /** Soft edge as a fraction of the radius, 0 to 1. */
  readonly feather: number;
  readonly flow: number;
  readonly points: readonly StrokePoint[];
};
/** Coverage painted with strokes; the renderer rasterizes them into a cached texture. */
export type BrushMask = {
  readonly kind: "brush";
  readonly strokes: readonly BrushStroke[];
};
type HealPatchBase = {
  readonly id: string;
  /** Feather applied after the stroke's dabs have accumulated into one patch shape. */
  readonly feather: number;
  readonly stroke: BrushStroke;
  readonly opacity: number;
};
export type SmartHealPatch = HealPatchBase & {
  readonly algorithm: "clone";
  readonly offset: Point;
};
/** One non-destructive repair. AI results are image resources positioned in source pixels. */
export type HealPatch =
  | SmartHealPatch
  | (HealPatchBase & {
      readonly algorithm: "ai";
      /** A previous patch changed after this generated result was produced. */
      readonly stale?: true;
      readonly result?: {
        readonly source: string;
        readonly origin: Point;
        readonly extent: Point;
      };
    });
export type HealAlgorithm = HealPatch["algorithm"];
export type Mask = Gradient | BrushMask;
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
  | { readonly kind: "fill"; readonly fill: Fill }
  | { readonly kind: "heal"; readonly patches: readonly HealPatch[] }
  | {
      readonly kind: "mask";
      readonly operation: "add" | "subtract";
      readonly mask: Mask;
      readonly adjustments: Readonly<Adjustments>;
      readonly toneCurve: ToneCurve;
    }
);
export type MaskLayer = Extract<ProcessingLayer, { kind: "mask" }>;
/** A child mask that adds to or subtracts from its parent's coverage. */
export type MaskModifier = Pick<
  MaskLayer,
  "id" | "mask" | "operation" | "opacity"
>;
export type EffectLayer = Exclude<ProcessingLayer, MaskLayer>;
export type Layer = ImageLayer | ProcessingLayer;

/** The sole image source is pinned below the ordered processing tree. */
export type Scene = {
  readonly frame: ImageFrame;
  readonly layers: readonly [ImageLayer, ...ProcessingLayer[]];
};
