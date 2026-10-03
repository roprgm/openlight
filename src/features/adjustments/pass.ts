import type { Adjustments } from "@/core/document";
import { type Primaries, primariesIndex } from "@/core/image";
import { node } from "@/core/renderer";
import shader from "./adjustments.wgsl";
import { exposure } from "./exposure";
import { defaultAdjustments } from "./model";

/**
 * Exposure alone takes the lighter pass; the full shader runs under its own name once another value
 * moves. Either develops an input in other `primaries` into the working space, so an 8-bit source
 * costs no pass of its own.
 */
export function adjustments(
  values: Adjustments,
  name = "layer",
  primaries: Primaries = "rec2020",
) {
  const exposureOnly = Object.entries(values).every(
    ([key, value]) =>
      key === "exposure" || value === Reflect.get(defaultAdjustments, key),
  );
  if (exposureOnly) {
    return exposure(`${name}/exposure`, values.exposure, primaries);
  }
  return node(`${name}/adjustments`, shader, {
    format: "rgba16float",
    set: {
      adjustments: { primaries: primariesIndex[primaries], ...values },
    },
    samplers: { sourceSampler: { minFilter: "linear", magFilter: "linear" } },
  });
}
