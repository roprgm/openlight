import { expect, test } from "bun:test";
import { init, target } from "vgpu/mock";
import { createDraftSession } from "@/app/draft/session";
import { createDraftStore, openDraft, snapshotDraft } from "@/app/draft/store";
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
  const file = new File([bytes], "photo.png", { type: "image/png" });
  const source = resources.add(file, await decode());
  const duplicate = await decode();
  expect(() => resources.add(file, duplicate, source)).toThrow(
    "already exists",
  );
  duplicate.dispose();
  const layers = [createImageLayer(source, "photo.png")] as const;
  const frame = imageFrame([8, 4]);
  const document = createDocument({ frame, layers }, resources);
  setAdjustments(document, { exposure: 0.5 });
  const vignette = addLayer(document, createLayer("vignette"));
  setVignette(document, { intensity: 30, softness: 70 }, vignette);
  const edited = document.scene.getState();

  // Taken before the document closes, a draft still completes; IndexedDB stores it with the structured
  // clone algorithm, which keeps File objects.
  const draft = snapshotDraft(document, "photo.png");
  document.dispose();
  const stored = structuredClone(await draft);
  // Without perspective the scene stays version 2, which an OpenLight from before it still opens.
  expect(stored.record).toMatchObject({
    version: 1,
    name: "photo.png",
    scene: { version: 2 },
  });
  expect(await stored.files.get(source)?.bytes()).toEqual(bytes);
  const recovered = await openDraft(stored, decode);
  expect(recovered.scene.getState()).toEqual(edited);
  expect(recovered.resources.get(source).file.name).toBe("photo.png");
  expect(recovered.history.status.getState().undoCount).toBe(0);
  recovered.dispose();

  const { record, files } = stored;
  for (const [value, message] of [
    [undefined, "Invalid draft"],
    [{ ...record, version: 2 }, "This draft needs a newer version"],
  ] as const) {
    await expect(
      openDraft({ record: value as typeof record, files }, decode),
    ).rejects.toThrow(message);
  }
  gpu.dispose();
});

test("a dismissed draft failure stays dismissed while autosave fails the same way", () => {
  const session = createDraftSession(createDraftStore(), {
    recoverDraft: async () => {},
    discardDraft: async () => {},
  });
  const error = () => session.state.getState().error;
  session.report(Error("IndexedDB is unavailable."));
  expect(error()).toBe("IndexedDB is unavailable.");
  session.dismiss();
  session.report(Error("IndexedDB is unavailable."));
  expect(error()).toBeUndefined();
  session.report(Error("The quota is exceeded."));
  expect(error()).toBe("The quota is exceeded.");
});
