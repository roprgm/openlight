import { effect, frame, init, target } from "vgpu";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { HealMode, Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

/** Document regions as `[x, y, width, height]`, aligned to the quarter-size proxy's pixels. */
const regions = {
  left: [120, 92, 8, 8],
  right: [128, 92, 8, 8],
  edge: [96, 92, 8, 8],
  outside: [56, 56, 16, 16],
} as const;

/**
 * A dark spot crosses a luminance edge on an HDR gradient; its donor, 60 pixels below, crosses the
 * same edge. Each render reports the mean RGBA of each region, at full size and as a proxy.
 */
export async function renderHealReference(
  cases: readonly {
    mode: Exclude<HealMode, "remove">;
    opacity: number;
    feather: number;
  }[],
) {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const image = target(gpu, { size: [256, 192], format: "rgba16float" });
  const source = createImageSource(image);
  const renderer = createEditorRenderer(gpu, source);
  const shader = effect(
    gpu,
    `
    @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
      let background = vec3f(0.2 + p.x * 0.002 + select(0.0, 0.5, p.x >= 128.0), 0.3 + p.y * 0.001, 1.4);
      let defect = distance(p.xy, vec2f(128.0, 96.0)) < 10.0 || distance(p.xy, vec2f(158.0, 156.0)) < 2.0;
      return vec4f(select(background, vec3f(0.02), defect), 0.75);
    }
  `,
  );
  try {
    frame(gpu, (frame) => frame.pass(image, shader));
    const results = [];
    for (const { mode, opacity, feather } of cases) {
      const scene: Scene = {
        frame: imageFrame(image.size),
        layers: [
          createImageLayer("source", "Reference"),
          {
            ...createLayer("heal"),
            patches: [
              {
                id: "spot",
                mode,
                feather,
                opacity,
                strokes: [
                  {
                    mode: "paint",
                    size: 56,
                    feather: 0,
                    flow: 1,
                    points: [[128, 96, 1]],
                  },
                ],
                offset: [0, 60],
              },
            ],
          },
        ],
      };
      for (const density of [1, 0.25]) {
        await renderer.update(scene, undefined, false, undefined, density);
        const output = renderer.fullImage();
        const pixels = await output.readFloats();
        const scale = output.size[0] / image.size[0];
        const mean = ([x, y, width, height]: readonly number[]) => {
          const sum = [0, 0, 0, 0];
          let count = 0;
          for (let py = y * scale; py < (y + height) * scale; py++) {
            for (let px = x * scale; px < (x + width) * scale; px++) {
              const i = (py * output.size[0] + px) * 4;
              for (let channel = 0; channel < 4; channel++)
                sum[channel] += pixels[i + channel];
              count++;
            }
          }
          return sum.map((value) => value / count);
        };
        const means = {
          left: mean(regions.left),
          right: mean(regions.right),
          edge: mean(regions.edge),
          outside: mean(regions.outside),
        };
        results.push({ mode, opacity, feather, density, means });
      }
    }
    return { results, errors };
  } finally {
    renderer.dispose();
    source.dispose();
    gpu.dispose();
  }
}
