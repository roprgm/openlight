import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createExportSession } from "@/app/editor/export/export-image";
import { createImageLayer } from "@/app/editor/layers";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";

test("an export session renders each refresh in order, encodes nothing before the first, and holds nothing once disposed", async () => {
  const gpu = await init();
  const image = target(gpu, { size: [32, 16], format: "rgba16float" });
  const source = createImageSource(image);
  const resources = createResources();
  const id = resources.add(new File([], "photo.png"), source);
  const document = createDocument(
    { frame: imageFrame(image.size), layers: [createImageLayer(id, "Photo")] },
    resources,
  );
  const session = createExportSession(gpu, document);
  const outcomes: (string | undefined)[] = [];
  session.subscribe((failure) => outcomes.push(failure));
  try {
    await expect(session.encode({})).rejects.toThrow("still rendering");
    await session.refresh();
    setAdjustments(document, { exposure: 1 });
    await Promise.all([session.refresh(), session.refresh()]);
    expect(outcomes).toEqual([undefined, undefined, undefined]);
    session.dispose();
    await session.refresh();
    expect(outcomes).toHaveLength(3);
    await expect(session.encode({})).rejects.toThrow("still rendering");
  } finally {
    document.dispose();
    gpu.dispose();
  }
});
