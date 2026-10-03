import { z } from "zod/mini";
import {
  type DefaultEffect,
  editEffect,
  findEffect,
} from "@/app/editor/layers";
import type {
  Adjustments,
  ColorMixer,
  Details,
  EditorDocument,
  Grain,
  ImageLayer,
  ToneCurve,
  Vignette,
} from "@/core/document";
import type { RawDevelopment, WhiteBalance } from "@/core/image";
import { setAdjustments } from "@/features/adjustments/edits";
import { adjustmentsSchema } from "@/features/adjustments/model";
import { setColorMixer } from "@/features/color-mixer/edits";
import {
  colors,
  defaultMixer,
  isNeutral,
  mixerSchema,
} from "@/features/color-mixer/model";
import { setDetails } from "@/features/details/edits";
import { defaultDetails, detailsSchema } from "@/features/details/model";
import { setGrain } from "@/features/grain/edits";
import { defaultGrain, grainSchema } from "@/features/grain/model";
import { curveSchema } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setVignette } from "@/features/vignette/edits";
import { defaultVignette, vignetteSchema } from "@/features/vignette/model";
import {
  setIncrementalBalance,
  setWhiteBalance,
  whiteBalanceSchema,
} from "@/features/white-balance/edits";
import { parse } from "@/lib/parse";

type IncrementalBalance = Pick<
  Adjustments,
  "incrementalTemperature" | "incrementalTint"
>;

/**
 * A photo's global settings by category: each one chosen is complete, and the others are absent.
 * Effects hold the values of the photo's first root layer of their kind.
 */
export type Settings = {
  readonly light?: Pick<
    Adjustments,
    "exposure" | "contrast" | "highlights" | "shadows" | "whites" | "blacks"
  >;
  /** A RAW photo's balance in kelvin, or any other photo's incremental temperature and tint. */
  readonly whiteBalance?: WhiteBalance | IncrementalBalance;
  readonly color?: Pick<Adjustments, "vibrance" | "saturation">;
  readonly toneCurve?: ToneCurve;
  readonly colorMixer?: ColorMixer;
  readonly details?: Details;
  readonly vignette?: Vignette;
  readonly grain?: Grain;
};
export type Category = keyof Settings;

const adjustments = z.strictObject(adjustmentsSchema.shape);

/** Unknown categories and fields are rejected, so settings apply exactly as written or not at all. */
export const settingsSchema = z.strictObject({
  light: z.optional(
    z.pick(adjustments, {
      exposure: true,
      contrast: true,
      highlights: true,
      shadows: true,
      whites: true,
      blacks: true,
    }),
  ),
  // A RAW photo's range depends on its As Shot balance, so applying checks the kelvin values.
  whiteBalance: z.optional(
    z.union([
      z.strictObject({ temperature: z.number(), tint: z.number() }),
      z.pick(adjustments, {
        incrementalTemperature: true,
        incrementalTint: true,
      }),
    ]),
  ),
  color: z.optional(z.pick(adjustments, { vibrance: true, saturation: true })),
  toneCurve: z.optional(curveSchema),
  colorMixer: z.optional(z.strictObject(mixerSchema.shape)),
  details: z.optional(z.strictObject(detailsSchema.shape)),
  vignette: z.optional(z.strictObject(vignetteSchema.shape)),
  grain: z.optional(z.strictObject(grainSchema.shape)),
}) satisfies z.ZodMiniType<Settings>;

function whiteBalanceOf(
  image: ImageLayer,
  raw: RawDevelopment | undefined,
): NonNullable<Settings["whiteBalance"]> {
  if (raw) {
    return image.whiteBalance ?? raw.asShot;
  }
  const { incrementalTemperature, incrementalTint } = image.adjustments;
  return { incrementalTemperature, incrementalTint };
}

/** The photo's settings in the chosen categories; an effect without a root layer copies its defaults. */
export function copySettings(
  document: EditorDocument,
  chosen: ReadonlySet<Category>,
): Settings {
  const { layers } = document.scene.getState();
  const [image] = layers;
  const { raw } = document.resources.get(image.source);
  const { exposure, contrast, highlights, shadows, whites, blacks } =
    image.adjustments;
  const { vibrance, saturation } = image.adjustments;
  return {
    ...(chosen.has("light") && {
      light: { exposure, contrast, highlights, shadows, whites, blacks },
    }),
    ...(chosen.has("whiteBalance") && {
      whiteBalance: whiteBalanceOf(image, raw),
    }),
    ...(chosen.has("color") && { color: { vibrance, saturation } }),
    ...(chosen.has("toneCurve") && { toneCurve: image.toneCurve }),
    ...(chosen.has("colorMixer") && {
      colorMixer: findEffect(layers, "color-mixer")?.colorMixer ?? defaultMixer,
    }),
    ...(chosen.has("details") && {
      details: findEffect(layers, "details")?.details ?? defaultDetails,
    }),
    ...(chosen.has("vignette") && {
      vignette: findEffect(layers, "vignette")?.vignette ?? defaultVignette,
    }),
    ...(chosen.has("grain") && {
      grain: findEffect(layers, "grain")?.grain ?? defaultGrain,
    }),
  };
}

/**
 * Checks now that the photo takes this white balance, and returns its edit: kelvin only within a RAW
 * photo's range, incremental temperature and tint only on other photos, which show them.
 */
function whiteBalanceEdit(
  document: EditorDocument,
  balance: NonNullable<Settings["whiteBalance"]>,
) {
  const [image] = document.scene.getState().layers;
  const { raw } = document.resources.get(image.source);
  if (!("temperature" in balance)) {
    if (raw) {
      throw Error(
        "This white balance is an incremental Temp and Tint, which a RAW photo sets in kelvin instead.",
      );
    }
    return () => setIncrementalBalance(document, image.id, balance);
  }
  if (!raw) {
    throw Error("This white balance is in kelvin, which only a RAW photo has.");
  }
  const kelvin = parse(
    whiteBalanceSchema(raw.asShot),
    balance,
    "Invalid RAW white balance",
  );
  return () => setWhiteBalance(document, kelvin);
}

function isDefault(values: object, defaults: object) {
  return Object.entries(defaults).every(
    ([key, value]) => Reflect.get(values, key) === value,
  );
}

/**
 * Edits the first root layer of the kind in place, keeping its place, visibility, opacity, and children,
 * or adds one on top unless the values are the defaults a missing layer stands for.
 */
function applyEffect(
  document: EditorDocument,
  kind: DefaultEffect,
  defaults: boolean,
  edit: (id: string) => void,
) {
  if (defaults && !findEffect(document.scene.getState().layers, kind)) {
    return;
  }
  editEffect(document, kind, undefined, edit);
}

function setMixer(document: EditorDocument, mixer: ColorMixer, id: string) {
  colors.forEach(({ id: color }, index) => {
    setColorMixer(
      document,
      color,
      {
        hue: mixer.hue[index],
        saturation: mixer.saturation[index],
        luminance: mixer.luminance[index],
      },
      id,
    );
  });
}

/**
 * Replaces each category the settings hold and keeps everything else, as one edit after any open
 * gesture. Settings the photo can't take are rejected before anything changes.
 */
export function applySettings(document: EditorDocument, settings: Settings) {
  const {
    light,
    whiteBalance,
    color,
    toneCurve,
    colorMixer,
    details,
    vignette,
    grain,
  } = parse(settingsSchema, settings, "Invalid settings");
  const balance = whiteBalance && whiteBalanceEdit(document, whiteBalance);
  document.history.commit();
  document.history.begin();
  try {
    setAdjustments(document, { ...light, ...color });
    balance?.();
    if (toneCurve) {
      setToneCurve(document, toneCurve);
    }
    if (colorMixer) {
      applyEffect(document, "color-mixer", isNeutral(colorMixer), (id) =>
        setMixer(document, colorMixer, id),
      );
    }
    if (details) {
      applyEffect(
        document,
        "details",
        isDefault(details, defaultDetails),
        (id) => setDetails(document, details, id),
      );
    }
    if (vignette) {
      applyEffect(
        document,
        "vignette",
        isDefault(vignette, defaultVignette),
        (id) => setVignette(document, vignette, id),
      );
    }
    if (grain) {
      applyEffect(document, "grain", isDefault(grain, defaultGrain), (id) =>
        setGrain(document, grain, id),
      );
    }
    document.history.commit();
  } catch (error) {
    document.history.cancel();
    throw error;
  }
}
