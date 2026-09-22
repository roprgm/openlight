import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { openDraft, snapshotDraft } from "@/app/draft/store";
import { createImageLayer, createLayer } from "@/app/editor/layers";
import { createDocument, createResources } from "@/core/document";
import { createImageSource } from "@/core/image";
import { imageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { addLayer } from "@/features/layers/edits";
import { setVignette } from "@/features/vignette/edits";

test("a draft survives storage's structured clone, reopens under its source ID, and rejects malformed records", async () => {
  const gpu = await init();
  const decode = () =>
    Promise.resolve(
      createImageSource(target(gpu, { size: [8, 4], format: "rgba16float" })),
    );
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const resources = createResources();
  const source = resources.add(
    new File([bytes], "photo.png", { type: "image/png" }),
    await decode(),
  );
  expect(() =>
    resources.add(
      new File([], "copy.png"),
      createImageSource(target(gpu, { size: [1, 1] })),
      source,
    ),
  ).toThrow("already exists");
  const document = createDocument(
    {
      frame: imageFrame([8, 4]),
      layers: [createImageLayer(source, "photo.png")],
    },
    resources,
  );
  setAdjustments(document, { exposure: 0.5 });
  const vignette = addLayer(document, createLayer("vignette"));
  setVignette(document, { intensity: 30, softness: 70 }, vignette);
  const edited = document.scene.getState();

  // IndexedDB stores values with the structured clone algorithm, which keeps File objects.
  const stored = structuredClone(snapshotDraft(document, "photo.png"));
  document.dispose();
  expect(stored.record).toMatchObject({ version: 1, name: "photo.png" });
  const file = stored.files.get(source);
  expect(file).toBeInstanceOf(File);
  expect(await file?.bytes()).toEqual(bytes);
  const recovered = await openDraft(stored, decode);
  expect(recovered.scene.getState()).toEqual(edited);
  expect(recovered.resources.get(source).file.name).toBe("photo.png");
  expect(recovered.history.status.getState().undoCount).toBe(0);
  recovered.dispose();

  const { record, files } = stored;
  const malformed: [unknown, string][] = [
    [undefined, "Invalid draft"],
    [{ ...record, version: "1" }, "Invalid draft version"],
    [{ ...record, version: 2 }, "This draft needs a newer version"],
    [{ ...record, scene: undefined }, "doesn't contain an OpenLight scene"],
    [
      { ...record, scene: { ...record.scene, version: 2 } },
      "This scene needs a newer version",
    ],
  ];
  for (const [value, message] of malformed) {
    await expect(
      openDraft({ record: value as typeof record, files }, decode),
    ).rejects.toThrow(message);
  }
  await expect(openDraft({ record, files: new Map() }, decode)).rejects.toThrow(
    "The scene's image is missing.",
  );

  // A draft from before a group gained a parameter opens with its default, as a scene file does.
  const older = structuredClone(record);
  const layer = older.scene.scene.layers[1];
  if (layer.kind !== "vignette") throw Error("Missing vignette.");
  Reflect.deleteProperty(layer.vignette, "softness");
  const reopened = await openDraft({ record: older, files }, decode);
  expect(reopened.scene.getState().layers[1]).toMatchObject({
    vignette: { intensity: 30, softness: 50 },
  });
  reopened.dispose();
});
