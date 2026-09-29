import { effect, frame, type Gpu, type Target } from "vgpu";
import { weakMemo } from "@/lib/weak-memo";
import uploadShader from "./upload.wgsl";

/** Rows moved at a time, so neither direction holds a copy of the whole raster. */
const bandRows = 256;

const upload = weakMemo((gpu: Gpu) => effect(gpu, uploadShader));

/**
 * Reads an rgba8 raster band by band and deflates its bytes, rows tightly packed. Nothing may draw into
 * the raster until it resolves, since each band is read after the last.
 */
export async function readRaster(gpu: Gpu, raster: Target) {
  const device = gpu.gpu;
  const [width, height] = raster.size;
  const rowBytes = width * 4;
  // Buffer copies take rows aligned to 256 bytes.
  const stride = Math.ceil(rowBytes / 256) * 256;
  const buffer = gpu.device.createBuffer({
    size: stride * Math.min(bandRows, height),
    usage: ["copy_dst", "copy_src"],
  });
  const compression = new CompressionStream("deflate-raw");
  const writer = compression.writable.getWriter();
  const pixels = new Response(compression.readable).blob();
  try {
    for (let y = 0; y < height; y += bandRows) {
      const rows = Math.min(bandRows, height - y);
      const encoder = device.createCommandEncoder();
      encoder.copyTextureToBuffer(
        { texture: raster.color.gpu, origin: [0, y] },
        { buffer: buffer.gpu, bytesPerRow: stride },
        [width, rows],
      );
      device.queue.submit([encoder.finish()]);
      const read = new Uint8Array(await buffer.read(stride * rows));
      const band = new Uint8Array(rowBytes * rows);
      for (let row = 0; row < rows; row++) {
        const start = row * stride;
        band.set(read.subarray(start, start + rowBytes), row * rowBytes);
      }
      await writer.write(band);
    }
    await writer.close();
  } catch (error) {
    await writer.abort(error);
    throw error;
  } finally {
    buffer.destroy();
  }
  return pixels;
}

/**
 * Inflates bytes `readRaster` wrote into an rgba8 raster of the same size, band by band. Render targets
 * take no copies, so each band lands in a staging texture that draws into the raster.
 */
export async function writeRaster(gpu: Gpu, raster: Target, pixels: Blob) {
  const [width, height] = raster.size;
  const rowBytes = width * 4;
  const band = new Uint8Array(rowBytes * Math.min(bandRows, height));
  const staging = gpu.device.createTexture({
    size: [width, band.length / rowBytes],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst"],
  });
  let filled = 0;
  let y = 0;
  function draw(rows: number) {
    if (y + rows > height) {
      throw Error("The paint doesn't match the photo's size.");
    }
    // The queue copies the bytes at once, so the band is free to fill again, and draws in order.
    gpu.gpu.queue.writeTexture(
      { texture: staging.gpu },
      band,
      { bytesPerRow: rowBytes },
      [width, rows],
    );
    const pass = upload(gpu).set({ band: staging, params: { top: y } });
    frame(gpu, (frame) =>
      frame.pass(
        { target: raster, clear: false, scissor: [0, y, width, rows] },
        pass,
      ),
    );
    y += rows;
  }
  const reader = pixels
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      for (let offset = 0; offset < value.length; ) {
        const taken = Math.min(band.length - filled, value.length - offset);
        band.set(value.subarray(offset, offset + taken), filled);
        filled += taken;
        offset += taken;
        if (filled === band.length) {
          draw(band.length / rowBytes);
          filled = 0;
        }
      }
    }
    if (filled % rowBytes !== 0) {
      throw Error("The paint doesn't match the photo's size.");
    }
    if (filled) {
      draw(filled / rowBytes);
    }
    if (y !== height) {
      throw Error("The paint doesn't match the photo's size.");
    }
  } finally {
    staging.dispose();
  }
}
