import { z } from "zod/mini";
import { type EditorDocument, editLayer } from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import { parse, range } from "@/lib/parse";

export function whiteBalanceLimits(asShot: WhiteBalance) {
  return {
    temperature: {
      min: Math.min(2000, asShot.temperature),
      max: Math.max(25000, asShot.temperature),
    },
    tint: {
      min: Math.min(-150, asShot.tint),
      max: Math.max(150, asShot.tint),
    },
  };
}

/** Absolute white balance within the ranges that include the file's as-shot value. */
export function whiteBalanceSchema(asShot: WhiteBalance) {
  const { temperature, tint } = whiteBalanceLimits(asShot);
  return z.object({
    temperature: range(temperature.min, temperature.max),
    tint: range(tint.min, tint.max),
  }) satisfies z.ZodMiniType<WhiteBalance>;
}

/** Without a change, resets to the camera's as-shot balance. */
export function setWhiteBalance(
  document: EditorDocument,
  change?: Partial<WhiteBalance>,
) {
  const scene = document.scene.getState();
  const asShot = document.resources.get(scene.layers[0].source).raw?.asShot;
  if (!asShot) {
    throw Error("This image does not support RAW white balance.");
  }
  const whiteBalance = change
    ? parse(
        whiteBalanceSchema(asShot),
        { ...(scene.layers[0].whiteBalance ?? asShot), ...change },
        "Invalid RAW white balance",
      )
    : asShot;
  editLayer(document, scene.layers[0].id, (layer) => {
    if (layer.kind !== "image") {
      throw Error("Select the image layer.");
    }
    return { ...layer, whiteBalance };
  });
}
