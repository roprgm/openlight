import type { Gpu } from "vgpu";
import { isSceneFile, openSceneFile } from "@/app/scene-file";
import type { Workspace } from "@/app/workspace";
import decode from "@/core/image/decode";
import type { FileLoader } from "./registry";

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
