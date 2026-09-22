import { effect, frame, init, target } from "vgpu";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

/** A dark spot crosses a luminance edge on an HDR gradient. Its donor crosses the same edge. */
export async function renderHealReference() {
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
  const scene: Scene = {
    frame: imageFrame(image.size),
    layers: [
      createImageLayer("source", "Reference"),
      {
        ...createLayer("heal"),
        patches: [
          {
            id: "spot",
            feather: 0.25,
            opacity: 1,
            stroke: {
              mode: "paint",
              size: 56,
              feather: 0,
              flow: 1,
              points: [[128, 96, 1]],
            },
            offset: [0, 60],
          },
        ],
      },
    ],
  };
  try {
    frame(gpu, (frame) => frame.pass(image, shader));
    const results = [];
    const healing = scene.layers[1];
    if (healing.kind !== "heal") throw Error("Healing layer missing.");
    for (const feather of [0, 0.75]) {
      const renderScene: Scene = {
        ...scene,
        layers: [
          scene.layers[0],
          {
            ...healing,
            patches: healing.patches.map((patch) => ({
              ...patch,
              feather,
            })),
          },
        ],
      };
      for (const proxy of [false, true]) {
        renderer.setDisplayScale(0.25);
        await renderer.update(renderScene, undefined, proxy);
        const output = renderer.fullImage();
        const pixels = await output.readFloats();
        const scale = 256 / output.size[0];
        const samples = [
          [128, 96],
          [120, 96],
          [136, 96],
          [100, 96],
          [158, 96],
          [64, 64],
        ].map(([x, y]) => {
          const px = Math.floor(x / scale);
          const py = Math.floor(y / scale);
          const p = [(px + 0.5) * scale, (py + 0.5) * scale];
          const i = (py * output.size[0] + px) * 4;
          return {
            actual: [...pixels.slice(i, i + 4)],
            expected: [
              0.2 + p[0] * 0.002 + (p[0] >= 128 ? 0.5 : 0),
              0.3 + p[1] * 0.001,
              1.4,
              0.75,
            ],
          };
        });
        results.push({ feather, proxy, samples });
      }
    }
    return { results, errors };
  } finally {
    renderer.dispose();
    source.dispose();
    gpu.dispose();
  }
}
