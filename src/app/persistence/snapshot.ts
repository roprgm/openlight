import type { Gpu } from "vgpu";
import {
  createDocument,
  createResources,
  type EditorDocument,
  type Scene,
  walkLayers,
} from "@/core/document";
import decode from "@/core/image/decode";
import { parseScene } from "./scene";

export type DocumentSnapshot = {
  scene: Scene;
  sources: { id: string; file: File }[];
};

function sourceIds(scene: Scene) {
  return [
    ...new Set(
      walkLayers(scene.layers)
        .filter((layer) => layer.kind === "image")
        .map((layer) => layer.source),
    ),
  ];
}

/** Capture file references before an asynchronous save can outlive the document. */
export function captureDocument(document: EditorDocument): DocumentSnapshot {
  const scene = document.scene.getState();
  const sources = sourceIds(scene).map((id) => ({
    id,
    file: document.resources.get(id).file,
  }));
  return { scene, sources };
}

export function parseSnapshot(value: unknown): DocumentSnapshot {
  if (
    !value ||
    typeof value !== "object" ||
    !("scene" in value) ||
    !("sources" in value) ||
    !Array.isArray(value.sources)
  ) {
    throw new Error("Invalid saved draft.");
  }
  const scene = parseScene(value.scene);
  const sources = value.sources;
  const ids = new Set<string>();
  for (const source of sources) {
    if (
      !source ||
      typeof source !== "object" ||
      typeof source.id !== "string" ||
      !source.id ||
      !(source.file instanceof File) ||
      ids.has(source.id)
    ) {
      throw new Error("Invalid saved draft source.");
    }
    ids.add(source.id);
  }
  const referenced = sourceIds(scene);
  if (referenced.length !== ids.size || referenced.some((id) => !ids.has(id))) {
    throw new Error("Saved draft sources do not match its scene.");
  }
  return { scene, sources };
}

export async function restoreDocument(gpu: Gpu, snapshot: DocumentSnapshot) {
  const resources = createResources();
  try {
    for (const { id, file } of snapshot.sources) {
      resources.add(file, await decode(gpu, file), id);
    }
    return createDocument(snapshot.scene, resources);
  } catch (error) {
    resources.dispose();
    throw error;
  }
}
