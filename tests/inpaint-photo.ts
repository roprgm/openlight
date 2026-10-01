import { effect, frame, init, target } from "vgpu";
import { encodeImage } from "@/app/editor/export/export-image";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createEditorRenderer } from "@/app/editor/renderer";
import type { BrushStroke, Scene } from "@/core/document";
import { createImageSource } from "@/core/image";
import { decode } from "@/core/image/decode";
import { imageFrame } from "@/core/image/frame";

/** Exercise decoding, removal and export without mounting React. A spot adds a known defect. */
export async function removeFromPhoto(stroke: BrushStroke, spot = false) {
  const gpu = await init();
  const errors: string[] = [];
  gpu.onError((error) => errors.push(error.message));
  const blob = await (await fetch("/images/demo.jpg")).blob();
  const original = await decode(
    gpu,
    new File([blob], "demo.jpg", { type: blob.type }),
  );
  const damaged = target(gpu, {
    size: original.image.size,
    format: "rgba16float",
  });
  const source = createImageSource(damaged);
  const renderer = createEditorRenderer(gpu, source);
  const [x, y] = stroke.points[0];
  try {
    const copy = effect(
      gpu,
      `
      struct Params { center: vec2f, radius: f32, damaged: u32 }
      @group(0) @binding(0) var source: texture_2d<f32>;
      @group(0) @binding(1) var<uniform> params: Params;
      @fragment fn fs_main(@builtin(position) p: vec4f) -> @location(0) vec4f {
        let color = textureLoad(source, vec2i(p.xy), 0);
        let defect = params.damaged != 0u && distance(p.xy, params.center) < params.radius;
        return vec4f(select(color.rgb, vec3f(0.01), defect), color.a);
      }
    `,
      {
        set: {
          source: original.image.color,
          params: {
            center: [x, y],
            radius: stroke.size / 2 - 5,
            damaged: Number(spot),
          },
        },
      },
    );
    frame(gpu, (f) => f.pass(damaged, copy));
    const scene: Scene = {
      frame: imageFrame(damaged.size),
      layers: [
        createImageLayer("photo", "Demo"),
        {
          ...createLayer("heal"),
          patches: [
            {
              id: "object",
              mode: "remove",
              feather: stroke.feather,
              opacity: 1,
              stroke: { ...stroke, feather: 0 },
            },
          ],
        },
      ],
    };
    await gpu.gpu.queue.onSubmittedWorkDone();
    const start = performance.now();
    await renderer.update(scene);
    await gpu.gpu.queue.onSubmittedWorkDone();
    const completedMs = performance.now() - start;
    const images = await Promise.all(
      [damaged, renderer.fullImage(), original.image].map(async (image) => [
        ...new Uint8Array(await (await encodeImage(gpu, image)).arrayBuffer()),
      ]),
    );
    await gpu.settled();
    return { completedMs, images, errors, storage: renderer.inspect() };
  } finally {
    renderer.dispose();
    source.dispose();
    original.dispose();
    gpu.dispose();
  }
}
