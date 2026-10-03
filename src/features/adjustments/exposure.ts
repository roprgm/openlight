import { type Primaries, primariesIndex } from "@/core/image";
import { node } from "@/core/renderer";
import shader from "./exposure.wgsl";

/** Exposure in stops; the pass also develops an input in other `primaries` into the working space. */
export function exposure(
  name: string,
  value: number,
  primaries: Primaries = "rec2020",
) {
  if (value === 0 && primaries === "rec2020") {
    return;
  }
  return node(name, shader, {
    format: "rgba16float",
    set: { params: { primaries: primariesIndex[primaries], exposure: value } },
  });
}
