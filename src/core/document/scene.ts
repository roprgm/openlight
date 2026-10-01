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

/** Film grain in 0..100 UI units, anchored to source pixels. */
export type Grain = {
  readonly amount: number;
  readonly size: number;
  readonly roughness: number;
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

type Rgb = readonly [number, number, number];
/** A 3D color lookup table: `size`³ output colors for inputs spread evenly across `domain`. */
export type LookupTable = {
  readonly size: number;
  readonly domain: readonly [min: Rgb, max: Rgb];
  /** RGB triplets, with the red input varying fastest, then green, then blue. */
  readonly table: readonly number[];
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
/** A stroke that paints a color, `#rrggbb` sRGB; erasing removes paint whatever its color. */
export type PaintStroke = BrushStroke & { readonly color: string };
/** What strokes painted, a paint layer's color or a brush mask's coverage. */
export type Painting<S extends BrushStroke = BrushStroke> = {
  /** The document resource of pixels earlier strokes settled into, which `strokes` draw over. */
  readonly raster?: string;
  /** The latest strokes, which undo takes back by drawing the rest over `raster` again. */
  readonly strokes: readonly S[];
};
/** Coverage painted with strokes; the renderer rasterizes them into a cached texture. */
export type BrushMask = { readonly kind: "brush" } & Painting;
/** One non-destructive repair: a painted shape filled from a donor at `offset` source pixels away. */
export type HealPatch = {
  readonly id: string;
  /** Feather applied after the stroke's dabs have accumulated into one patch shape. */
  readonly feather: number;
  readonly stroke: BrushStroke;
  readonly opacity: number;
  readonly offset: Point;
};
/** An sRGB sample with a perceptual color tolerance and a soft transition, both 0..1. */
export type ColorRange = {
  readonly kind: "color-range";
  readonly color: string;
  readonly tolerance: number;
  readonly smoothness: number;
};
/** Display-referred brightness bounds and their soft transition, all 0..1. */
export type LuminanceRange = {
  readonly kind: "luminance-range";
  readonly min: number;
  readonly max: number;
  readonly smoothness: number;
};
export type RangeMask = ColorRange | LuminanceRange;
export type Mask = Gradient | BrushMask | RangeMask;
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
  | { readonly kind: "grain"; readonly grain: Grain }
  | { readonly kind: "color-mixer"; readonly colorMixer: ColorMixer }
  | { readonly kind: "fill"; readonly fill: Fill }
  | { readonly kind: "lut"; readonly lut: LookupTable }
  | { readonly kind: "heal"; readonly patches: readonly HealPatch[] }
  | ({ readonly kind: "paint"; readonly blend: Blend } & Painting<PaintStroke>)
  | {
      readonly kind: "mask";
      readonly operation: "add" | "subtract";
      readonly mask: Mask;
      readonly adjustments: Readonly<Adjustments>;
      readonly toneCurve: ToneCurve;
    }
);
export type MaskLayer = Extract<ProcessingLayer, { kind: "mask" }>;
export type PaintLayer = Extract<ProcessingLayer, { kind: "paint" }>;
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
