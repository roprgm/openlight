import { effect, frame, type Gpu, type Target, target } from "vgpu";
import type { EncodedImage } from "@/core/image";
import { weakMemo } from "@/lib/weak-memo";
import type { Decoded } from "./types";
import shader from "./upload.wgsl";

type Size = [number, number];

/** Display P3 primaries, which TypeScript's VideoColorPrimaries doesn't list yet. */
const isP3 = (frame?: VideoFrame) =>
  `${frame?.colorSpace.primaries}` === "smpte432";

/** A texture of sRGB-encoded bytes, which the GPU decodes to linear when it reads them. */
function encoded(gpu: Gpu, size: Size) {
  return gpu.device.createTexture({
    size,
    format: "rgba8unorm-srgb",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
  });
}

/** Uploads the decoded image into a staging texture, tiles laid out on their grid. */
function stage(gpu: Gpu, decoded: Decoded) {
  const queue = gpu.gpu.queue;
  const size: Size = [decoded.width, decoded.height];
  if (decoded instanceof ImageBitmap) {
    const texture = encoded(gpu, size);
    queue.copyExternalImageToTexture(
      { source: decoded },
      { texture: texture.gpu },
      size,
    );
    decoded.close();
    return texture;
  }
  if ("tiles" in decoded) {
    const { tiles, columns } = decoded;
    const tile: Size = [
      tiles[0]?.displayWidth ?? 0,
      tiles[0]?.displayHeight ?? 0,
    ];
    const rows = Math.ceil(tiles.length / columns);
    const texture = encoded(gpu, [columns * tile[0], rows * tile[1]]);
    tiles.forEach((frame, i) => {
      const origin = [
        (i % columns) * tile[0],
        Math.floor(i / columns) * tile[1],
      ];
      const colorSpace = isP3(frame) ? "display-p3" : "srgb";
      queue.copyExternalImageToTexture(
        { source: frame },
        { texture: texture.gpu, origin, colorSpace },
        tile,
      );
      frame.close();
    });
    return texture;
  }
  const texture = encoded(gpu, size);
  queue.writeTexture(
    { texture: texture.gpu },
    decoded.data,
    { bytesPerRow: decoded.width * 4 },
    size,
  );
  return texture;
}

/** One layout pass per GPU, released with its device. */
const layout = weakMemo((gpu: Gpu) => effect(gpu, shader));

/**
 * GPU leg for sRGB-encoded decoders: the decoded image as an 8-bit sRGB-encoded target, half the
 * memory of the working format, in the primaries it came in. The renderer converts what it reads.
 */
export function uploadDecoded(gpu: Gpu, decoded: Decoded): EncodedImage {
  const frames = "tiles" in decoded ? decoded : undefined;
  const rotation = frames?.rotation ?? 0;
  const primaries = isP3(frames?.tiles[0]) ? "display-p3" : "srgb";
  const size: Size = [decoded.width, decoded.height];
  const source = stage(gpu, decoded);
  let image: Target | undefined;
  try {
    const output = target(gpu, {
      size: rotation % 2 ? [size[1], size[0]] : size,
      format: "rgba8unorm-srgb",
    });
    image = output;
    const params = { size, rotation };
    frame(gpu, (f) => f.pass(output, layout(gpu).set({ source, params })));
    return { image: output, primaries };
  } catch (error) {
    image?.color.dispose();
    throw error;
  } finally {
    source.dispose();
  }
}
