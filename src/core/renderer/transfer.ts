import { effect, frame, type Gpu, type Target } from "vgpu";
import copyShader from "@/core/renderer/strokes/copy.wgsl";
import { weakMemo } from "@/lib/weak-memo";

/** Rows moved at a time, so neither direction holds a copy of the whole raster. */
const bandRows = 256;

const copy = weakMemo((gpu: Gpu) => effect(gpu, copyShader));

/** `GPUMapMode.READ`, which the page's WebGPU types leave out. */
const mapRead = 1;

/** Bytes a texel takes in the formats rasters use. */
const texelBytes: Partial<Record<GPUTextureFormat, number>> = {
  r8unorm: 1,
  rgba8unorm: 4,
  rg16float: 4,
};

/** Bytes a row of a raster takes. */
function rowBytes({ size, format }: Target) {
  const bytes = texelBytes[format];
  if (!bytes) {
    throw Error(`Rasters can't transfer ${format}.`);
  }
  return size[0] * bytes;
}

/** Copies a raster into another of the same size and format, which render targets take by drawing. */
export function copyRaster(gpu: Gpu, source: Target, raster: Target) {
  const pass = copy(gpu).set({ source, params: { offset: [0, 0] } });
  frame(gpu, (frame) => frame.pass({ target: raster, clear: false }, pass));
}

/**
 * Reads a raster band by band and deflates its bytes, rows tightly packed. One mapped buffer takes
 * every band in turn. Nothing may draw into the raster until it resolves, since each band is read
 * after the last.
 */
export async function readRaster(gpu: Gpu, raster: Target) {
  const device = gpu.gpu;
  const [width, height] = raster.size;
  const packed = rowBytes(raster);
  // Buffer copies take rows aligned to 256 bytes.
  const stride = Math.ceil(packed / 256) * 256;
  const buffer = gpu.device.createBuffer({
    size: stride * Math.min(bandRows, height),
    usage: ["copy_dst", "map_read"],
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
      await buffer.gpu.mapAsync(mapRead, 0, stride * rows);
      const read = new Uint8Array(buffer.gpu.getMappedRange(0, stride * rows));
      const band = new Uint8Array(packed * rows);
      for (let row = 0; row < rows; row++) {
        const start = row * stride;
        band.set(read.subarray(start, start + packed), row * packed);
      }
      buffer.gpu.unmap();
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
 * Inflates bytes `readRaster` wrote into a raster of the same size and format, band by band. Render
 * targets take no copies, so each band lands in a staging texture that draws into the raster.
 */
export async function writeRaster(gpu: Gpu, raster: Target, pixels: Blob) {
  const [width, height] = raster.size;
  const packed = rowBytes(raster);
  const band = new Uint8Array(packed * Math.min(bandRows, height));
  const staging = gpu.device.createTexture({
    size: [width, band.length / packed],
    format: raster.format,
    usage: ["texture_binding", "copy_dst"],
  });
  let filled = 0;
  let y = 0;
  function draw(rows: number) {
    if (y + rows > height) {
      throw Error("The stored pixels don't match their raster's size.");
    }
    // The queue copies the bytes at once, so the band is free to fill again, and draws in order.
    gpu.gpu.queue.writeTexture(
      { texture: staging.gpu },
      band,
      { bytesPerRow: packed },
      [width, rows],
    );
    const pass = copy(gpu).set({
      source: staging,
      params: { offset: [0, -y] },
    });
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
          draw(band.length / packed);
          filled = 0;
        }
      }
    }
    if (filled % packed !== 0) {
      throw Error("The stored pixels don't match their raster's size.");
    }
    if (filled) {
      draw(filled / packed);
    }
    if (y !== height) {
      throw Error("The stored pixels don't match their raster's size.");
    }
  } finally {
    staging.dispose();
  }
}
