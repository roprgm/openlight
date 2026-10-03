import type { Target } from "vgpu";

export type WhiteBalance = { temperature: number; tint: number };
export type RawDevelopment = {
  asShot: WhiteBalance;
  createPass(): {
    prepare(balance: WhiteBalance): Promise<void>;
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
