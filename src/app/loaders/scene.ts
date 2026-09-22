import type { Gpu } from "vgpu";
import { loadScene } from "@/app/scene-package";
import type { Workspace } from "@/app/workspace";

export function createSceneLoader(gpu: Gpu, workspace: Workspace) {
  return {
    kind: "document" as const,
    accepts: (file: File) => file.name.toLowerCase().endsWith(".openlight"),
    load: (file: File) => workspace.open(file.name, () => loadScene(gpu, file)),
  };
}
