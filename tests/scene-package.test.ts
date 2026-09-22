import { expect, test } from "bun:test";
import { unzipSync, zipSync } from "fflate";
import { init, target } from "vgpu/mock";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { exportScene, loadScene } from "@/app/scene-package";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";

test("scene package stores editable content and unchanged source bytes", async () => {
  const gpu = await init();
  const resources = createResources();
  const original = new File([new Uint8Array([0, 1, 2, 255])], "image.png", {
    type: "image/png",
  });
  const image = createImageSource(
    target(gpu, { size: [8, 6], format: "rgba16float" }),
  );
  const id = resources.add(original, image);
  const scene = {
    frame: imageFrame([8, 6]),
    layers: [createImageLayer(id, original.name), createLayer("fill")],
  } as const;
  const document = createDocument(scene, resources);
  try {
    const file = await exportScene(document);
    expect(file.name).toBe("image.openlight");
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const manifest = JSON.parse(
      new TextDecoder().decode(archive["manifest.json"]),
    );
    expect(manifest.format).toBe("openlight");
    expect(manifest.version).toBe(1);
    expect(manifest.scene).toEqual(scene);
    expect(manifest.assets).toEqual([
      {
        id,
        role: "source",
        name: "image.png",
        mediaType: "image/png",
        path: "sources/0",
      },
    ]);
    expect(archive["sources/0"]).toEqual(
      new Uint8Array(await original.arrayBuffer()),
    );

    const invalid = new File(
      [
        zipSync({
          "manifest.json": new TextEncoder().encode(
            JSON.stringify({ ...manifest, version: 2 }),
          ),
        }),
      ],
      "invalid.openlight",
    );
    await expect(loadScene(gpu, invalid)).rejects.toThrow(
      "Unsupported or invalid",
    );
  } finally {
    document.dispose();
  }
});
