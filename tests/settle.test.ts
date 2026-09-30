import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { addLayer } from "@/features/layers/edits";
import { addPaintStroke } from "@/features/paint/edits";
import { settleAt, watchSettling } from "@/features/paint/settle";

test("an unsuccessful settle does not retry on its own", async () => {
  const gpu = await init();
  const source = createImageSource(
    target(gpu, { size: [64, 64], format: "rgba16float" }),
  );
  const resources = createResources();
  const sourceId = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    {
      frame: imageFrame(source.image.size),
      layers: [createImageLayer(sourceId, "Photo")],
    },
    resources,
  );
  // A renderer that cannot accept the settle, as after another photo opens.
  let settles = 0;
  const renderer = {
    settle: () => {
      settles++;
      // Stops a runaway loop, so the test fails rather than hangs.
      return settles < 50
        ? Promise.resolve(false)
        : new Promise<boolean>(() => {});
    },
    subscribe: () => () => {},
  };
  const stop = watchSettling(document, renderer);
  try {
    const paint = addLayer(document, createLayer("paint"));
    document.history.begin();
    for (let i = 0; i < settleAt; i++) {
      addPaintStroke(document, paint, {
        mode: "paint",
        size: 8,
        feather: 0.5,
        flow: 1,
        color: "#ff0000",
        points: [[10, 10, 1]],
      });
    }
    expect(settles).toBe(0);
    // Ending the gesture checks the crowded layer once.
    document.history.commit();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settles).toBe(1);
  } finally {
    stop();
    document.dispose();
    gpu.dispose();
  }
});
