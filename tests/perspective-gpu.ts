import { effect, frame, init, target } from "vgpu";
import { createImageLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { correct } from "@/features/crop/geometry";

/**
 * Renders a smooth chart through strong perspective twice, at full size and as the half-size proxy an
 * open gesture shows, and returns how far each proxy texel strays from the full pixels it stands for.
 */
export async function perspectiveProxy() {
  const gpu = await init();
  const size: [number, number] = [480, 320];
  const image = target(gpu, { size, format: "rgba16float" });
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  frame(gpu, (pass) =>
    pass.pass(
      image,
      effect(
        gpu,
        `@fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
          let uv = p.xy / vec2f(${size[0]}.0, ${size[1]}.0);
          return vec4f(uv, 0.5, 1.0);
        }`,
      ),
    ),
  );
  const source = createImageSource(image);
  const renderer = createEditorRenderer(gpu, source);
  const scene: Scene = {
    frame: correct(imageFrame(size), [70, -90], size),
    layers: [createImageLayer("chart", "Chart")],
  };
  try {
    await renderer.update(scene);
    const full = await renderer.outputImage().readFloats();
    renderer.setDisplayScale(0.5);
    await renderer.update({ ...scene }, undefined, true);
    const reduced = renderer.outputImage();
    const proxy = await reduced.readFloats();
    let stray = 0;
    for (let y = 0; y < reduced.size[1]; y++) {
      for (let x = 0; x < reduced.size[0]; x++) {
        for (let channel = 0; channel < 2; channel++) {
          let block = 0;
          for (const [dx, dy] of [
            [0, 0],
            [1, 0],
            [0, 1],
            [1, 1],
          ]) {
            block +=
              full[((2 * y + dy) * size[0] + 2 * x + dx) * 4 + channel] / 4;
          }
          const texel = proxy[(y * reduced.size[0] + x) * 4 + channel];
          // Sampling clamps within a texel of the chart's edge, where the crop may touch it.
          if (block > 0.01 && block < 0.99) {
            stray = Math.max(stray, Math.abs(texel - block));
          }
        }
      }
    }
    // Without correction the output's corners would show the chart's own corners.
    const corner = [...full.slice(0, 2)];
    return { proxySize: reduced.size, stray, corner, errors };
  } finally {
    renderer.dispose();
    source.dispose();
    gpu.dispose();
  }
}
