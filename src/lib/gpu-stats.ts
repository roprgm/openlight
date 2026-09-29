/** What the GPU allocated and freed of one kind of resource since the last reset, and what lives now. */
type Count = { made: number; freed: number; live: number; bytes: number };

/** Opt in with `?stats`, so the counting never runs for anyone who didn't ask for it. */
export const statsEnabled = new URLSearchParams(location.search).has("stats");

const count = (): Count => ({ made: 0, freed: 0, live: 0, bytes: 0 });
const stats = { textures: count(), buffers: count(), peakBytes: 0 };

const texelBytes: Record<string, number> = {
  r8unorm: 1,
  r16float: 2,
  rgba8unorm: 4,
  "rgba8unorm-srgb": 4,
  bgra8unorm: 4,
  r32float: 4,
  rgba16float: 8,
  rgba32float: 16,
};

function textureBytes({ size, format }: GPUTextureDescriptor) {
  const [width, height = 1, layers = 1] =
    Symbol.iterator in Object(size)
      ? [...(size as Iterable<number>)]
      : [
          (size as GPUExtent3DDict).width,
          (size as GPUExtent3DDict).height,
          (size as GPUExtent3DDict).depthOrArrayLayers,
        ];
  return width * height * layers * (texelBytes[format] ?? 4);
}

/**
 * Counts every texture and buffer the page creates and frees, wherever in the code, by wrapping
 * WebGPU's own methods once. A resource the garbage collector takes without `destroy` counts as freed.
 */
export function trackGpu() {
  const sizes = new WeakMap<object, [Count, number]>();
  const collected = new FinalizationRegistry<[Count, number]>(
    ([counter, bytes]) => release(counter, bytes),
  );
  function track(counter: Count, resource: object, bytes: number) {
    counter.made++;
    counter.live++;
    counter.bytes += bytes;
    sizes.set(resource, [counter, bytes]);
    collected.register(resource, [counter, bytes], resource);
    stats.peakBytes = Math.max(
      stats.peakBytes,
      stats.textures.bytes + stats.buffers.bytes,
    );
  }
  function release(counter: Count, bytes: number) {
    counter.freed++;
    counter.live--;
    counter.bytes -= bytes;
  }
  function destroyed(resource: object) {
    const tracked = sizes.get(resource);
    if (tracked) {
      sizes.delete(resource);
      collected.unregister(resource);
      release(...tracked);
    }
  }
  const { createTexture, createBuffer } = GPUDevice.prototype;
  const destroyTexture = GPUTexture.prototype.destroy;
  const destroyBuffer = GPUBuffer.prototype.destroy;
  GPUDevice.prototype.createTexture = function (descriptor) {
    const texture = createTexture.call(this, descriptor);
    track(stats.textures, texture, textureBytes(descriptor));
    return texture;
  };
  GPUDevice.prototype.createBuffer = function (descriptor) {
    const buffer = createBuffer.call(this, descriptor);
    track(stats.buffers, buffer, descriptor.size);
    return buffer;
  };
  GPUTexture.prototype.destroy = function () {
    destroyed(this);
    destroyTexture.call(this);
  };
  GPUBuffer.prototype.destroy = function () {
    destroyed(this);
    destroyBuffer.call(this);
  };
}

export function readGpuStats() {
  return {
    textures: { ...stats.textures },
    buffers: { ...stats.buffers },
    peakBytes: stats.peakBytes,
  };
}

/** Starts counting a workflow: made and freed from zero, and the peak from what lives now. */
export function resetGpuStats() {
  for (const counter of [stats.textures, stats.buffers]) {
    counter.made = 0;
    counter.freed = 0;
  }
  stats.peakBytes = stats.textures.bytes + stats.buffers.bytes;
}
