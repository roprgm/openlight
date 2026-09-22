import { parseScene } from "@/app/persistence/scene";
import type { Scene } from "@/core/document";

export type AssetEntry = {
  id: string;
  role: "source";
  name: string;
  mediaType: string;
  path: string;
};
export type Manifest = {
  format: "openlight";
  version: 1;
  scene: Scene;
  assets: AssetEntry[];
};

const decoder = new TextDecoder("utf-8", { fatal: true });

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseManifest(bytes: Uint8Array): Manifest {
  if (bytes.length > 1_000_000) throw new Error("Scene manifest is too large.");
  const value: unknown = JSON.parse(decoder.decode(bytes));
  if (
    !record(value) ||
    value.format !== "openlight" ||
    value.version !== 1 ||
    !Array.isArray(value.assets)
  ) {
    throw new Error("Unsupported or invalid OpenLight scene.");
  }
  const scene = parseScene(value.scene);
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const source of value.assets) {
    if (
      !record(source) ||
      typeof source.id !== "string" ||
      !source.id ||
      source.role !== "source" ||
      typeof source.name !== "string" ||
      typeof source.mediaType !== "string" ||
      typeof source.path !== "string" ||
      !/^sources\/[0-9]+$/.test(source.path) ||
      ids.has(source.id) ||
      paths.has(source.path)
    )
      throw new Error("Invalid scene source entry.");
    ids.add(source.id);
    paths.add(source.path);
  }
  const referenced = new Set([scene.layers[0].source]);
  if (
    referenced.size !== ids.size ||
    [...referenced].some((id) => !ids.has(id))
  ) {
    throw new Error("Scene sources do not match its image layers.");
  }
  return value as Manifest;
}
