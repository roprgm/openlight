import { unzipSync, zipSync } from "fflate";
import type { Gpu } from "vgpu";
import {
  createDocument,
  createResources,
  type EditorDocument,
  walkLayers,
} from "@/core/document";
import decode from "@/core/image/decode";
import { type AssetEntry, type Manifest, parseManifest } from "./manifest";

const encoder = new TextEncoder();

/** A versioned ZIP containing JSON content and unchanged original image files. */
export async function exportScene(document: EditorDocument): Promise<File> {
  const scene = document.scene.getState();
  const sourceIds = [
    ...new Set(
      walkLayers(scene.layers)
        .filter((item) => item.kind === "image")
        .map((item) => item.source),
    ),
  ];
  const sourceFiles = sourceIds.map((id) => ({
    id,
    file: document.resources.get(id).file,
  }));
  const assets: AssetEntry[] = [];
  const entries: Record<string, Uint8Array> = {};
  for (const [index, { id, file }] of sourceFiles.entries()) {
    const path = `sources/${index}`;
    assets.push({
      id,
      role: "source",
      name: file.name,
      mediaType: file.type,
      path,
    });
    entries[path] = new Uint8Array(await file.arrayBuffer());
  }
  const manifest: Manifest = {
    format: "openlight",
    version: 1,
    scene,
    assets,
  };
  entries["manifest.json"] = encoder.encode(JSON.stringify(manifest));
  const bytes = zipSync(entries, { level: 0 });
  const name = `${assets[0]?.name.replace(/\.[^.]*$/, "") || "scene"}.openlight`;
  return new File([bytes], name, { type: "application/zip" });
}

/** Rebuilds owned GPU sources before exposing the restored document. */
export async function loadScene(gpu: Gpu, file: File): Promise<EditorDocument> {
  let totalBytes = 0;
  const entries = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter(entry) {
      if (
        entry.name !== "manifest.json" &&
        !/^sources\/[0-9]+$/.test(entry.name)
      ) {
        return false;
      }
      totalBytes += entry.originalSize;
      if (
        (entry.name === "manifest.json" && entry.originalSize > 1_000_000) ||
        totalBytes > 1_000_000_000
      ) {
        throw new Error("Scene package is too large.");
      }
      return true;
    },
  });
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new Error("Scene manifest is missing.");
  const manifest = parseManifest(manifestBytes);
  const resources = createResources();
  try {
    for (const source of manifest.assets) {
      const bytes = entries[source.path];
      if (!bytes) throw new Error(`Scene image is missing: ${source.name}`);
      const imageFile = new File([bytes], source.name, {
        type: source.mediaType,
      });
      resources.add(imageFile, await decode(gpu, imageFile), source.id);
    }
    return createDocument(manifest.scene, resources);
  } catch (error) {
    resources.dispose();
    throw error;
  }
}
