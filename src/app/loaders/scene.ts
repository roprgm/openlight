import type { Gpu } from "vgpu";
import { openScene, snapshotScene } from "@/app/scene-file";
import type { Workspace } from "@/app/workspace";
import type { EditorDocument } from "@/core/document";
import type { ImageSource } from "@/core/image";
import { decode } from "@/core/image/decode";
import { readZip, writeZip } from "@/lib/zip";
import type { FileLoader } from "./registry";

export const sceneExtension = ".openlight";

/** Sources are stored, so only `scene.json` inflates; a scene with 7,000 stroke points is about 200 kB. */
const inflateLimit = 256 * 2 ** 20;

export function isSceneFile(file: File) {
  return file.name.toLowerCase().endsWith(sceneExtension);
}

/** The document as a ZIP archive: a deflated `scene.json` and each source's bytes at `sources/<id>`. */
export async function writeSceneFile(document: EditorDocument) {
  const { json, files } = snapshotScene(document);
  const archive = await writeZip([
    {
      name: "scene.json",
      data: new Blob([JSON.stringify(json)]),
      deflate: true,
    },
    ...[...files].map(([id, file]) => ({ name: `sources/${id}`, data: file })),
  ]);
  const [file] = files.values();
  const name = file.name.replace(/\.[^.]*$/, "") || "scene";
  return new File([archive], `${name}${sceneExtension}`);
}

export async function openSceneFile(
  file: Blob,
  decode: (file: File) => Promise<ImageSource>,
) {
  const entries = await readZip(file, inflateLimit);
  const json = entries.get("scene.json");
  if (!json) {
    throw Error("This file doesn't contain an OpenLight scene.");
  }
  const files = new Map(
    [...entries].flatMap(([name, data]) =>
      name.startsWith("sources/") ? [[name.slice(8), data] as const] : [],
    ),
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
      await workspace.open(file.name, () =>
        openSceneFile(file, (source) => decode(gpu, source)),
      );
    },
  };
}
