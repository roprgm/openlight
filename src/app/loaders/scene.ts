import type { Gpu } from "vgpu";
import { openScene, snapshotScene } from "@/app/scene-file";
import type { Workspace } from "@/app/workspace";
import type { EditorDocument } from "@/core/document";
import type { ImageSource } from "@/core/image";
import { decode } from "@/core/image/decode";
import type { FileLoader } from "./registry";

export const sceneExtension = ".openlight";

/** Sources are stored, so only `scene.json` inflates; a scene with 7,000 stroke points is about 200 kB. */
const inflateLimit = 256 * 2 ** 20;

function isSceneFile(file: File) {
  return file.name.toLowerCase().endsWith(sceneExtension);
}

/**
 * The document as a ZIP archive: a deflated `scene.json`, each source's bytes at `sources/<id>`, the
 * already deflated pixels paint settled into at `paint/<id>`, and Remove fields at `fields/<id>`.
 */
export async function writeSceneFile(document: EditorDocument) {
  await document.replaced();
  const { json, sources, paint, fields } = snapshotScene(document);
  const { writeZip } = await import("@/lib/zip");
  const archive = await writeZip([
    {
      name: "scene.json",
      data: new Blob([JSON.stringify(json)]),
      deflate: true,
    },
    ...[...sources].map(([id, data]) => ({ name: `sources/${id}`, data })),
    ...[...paint].map(([id, data]) => ({ name: `paint/${id}`, data })),
    ...[...fields].map(([id, data]) => ({ name: `fields/${id}`, data })),
  ]);
  const [file] = sources.values();
  const name = file.name.replace(/\.[^.]*$/, "") || "scene";
  return new File([archive], `${name}${sceneExtension}`);
}

export async function openSceneFile(
  file: Blob,
  decode: (file: File) => Promise<ImageSource>,
) {
  const { readZip } = await import("@/lib/zip");
  const entries = await readZip(file, inflateLimit);
  const json = entries.get("scene.json");
  if (!json) {
    throw Error("This file doesn't contain an OpenLight scene.");
  }
  const files = new Map(
    [...entries].flatMap(([name, data]) => {
      const [folder, id] = name.split("/");
      return ["sources", "paint", "fields"].includes(folder) && id
        ? [[id, data] as const]
        : [];
    }),
  );
  return openScene(JSON.parse(await json.text()), files, decode);
}

export function createSceneLoader(gpu: Gpu, workspace: Workspace): FileLoader {
  return {
    kind: "document",
    accepts: isSceneFile,
    async load(file) {
      if (!(file instanceof File)) {
        throw new Error("loadScene requires a File.");
      }
      return workspace.open(file.name, () =>
        openSceneFile(file, (source) => decode(gpu, source)),
      );
    },
  };
}
