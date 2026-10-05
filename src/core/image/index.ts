import type { Target } from "vgpu";

export type WhiteBalance = { temperature: number; tint: number };
/** A RAW photo's 2 × 2 color filter mosaic before the GPU demosaics it. */
export type Mosaic = {
  /** One `r16uint` sample per sensor pixel, unrotated, as decoded. */
  readonly samples: GPUTexture;
  /** Each 2 × 2 cell position's color, row-major: 0 red, 1 or 3 green, 2 blue. */
  pattern: readonly number[];
  /** Black level per color, in sensor units. */
  black: readonly number[];
  /** The level where samples clip, in sensor units. */
  white: number;
  /**
   * The samples with their noise reduced, which `reduce` makes the first time a renderer or control
   * asks, kept until the source closes; a failure lets the next ask try again.
   */
  denoised(
    reduce: (mosaic: Mosaic, signal: AbortSignal) => Promise<Target>,
  ): Promise<Target>;
};
/**
 * Samples a RAW pass develops in place of the decoded ones, blended toward them by `amount`, 0 to 1:
 * a half-size `rgba16float` image holding each 2 × 2 cell's four by position, above their black level.
 */
export type SampleBlend = { samples: Target; amount: number };
export type RawDevelopment = {
  asShot: WhiteBalance;
  /** The mosaic, when the GPU demosaics a 2 × 2 one, for processing before demosaicing. */
  mosaic?: Mosaic;
  createPass(): {
    prepare(balance: WhiteBalance, blend?: SampleBlend): Promise<void>;
    render(): Target;
    dispose(): void;
  };
  dispose(): void;
};

/**
 * The primaries an image's texels are in: the working space's, or the sRGB or Display P3 ones an
 * 8-bit source keeps, encoded in a texture format that decodes to linear when read.
 */
export type Primaries = "rec2020" | "srgb" | "display-p3";

/** The primaries as the shaders number them. */
export const primariesIndex: Record<Primaries, number> = {
  rec2020: 0,
  srgb: 1,
  "display-p3": 2,
};

/** A texture with the primaries its texels are in, which whoever reads it converts. */
export type EncodedImage = { image: Target; primaries: Primaries };

type SourceOptions = {
  raw?: RawDevelopment;
  /** The working space's unless said. */
  primaries?: Primaries;
};

/** Document content retained while a preview or export still uses it. */
export function createImageSource(
  image: Target,
  { raw, primaries = "rec2020" }: SourceOptions = {},
) {
  let references = 1;
  function release() {
    let active = true;
    return () => {
      if (!active) {
        return;
      }
      active = false;
      if (--references === 0) {
        image.color.dispose();
        raw?.dispose();
      }
    };
  }
  return {
    image,
    raw,
    primaries,
    retain() {
      if (!references) {
        throw Error("Image source is closed.");
      }
      references++;
      return release();
    },
    dispose: release(),
  };
}

export type ImageSource = ReturnType<typeof createImageSource>;
