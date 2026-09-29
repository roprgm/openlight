import { addLut } from "@/app/editor/layers";
import type { Workspace } from "@/app/workspace";
import { isCubeFile, readCubeFile } from "@/features/lut/cube";
import type { FileLoader } from "./registry";

/** A `.cube` file adds a LUT layer on top of the stack; one that can't be read shows beside the document. */
export function createLutLoader(workspace: Workspace): FileLoader {
  return {
    kind: "settings",
    accepts: isCubeFile,
    async load(file) {
      const document = workspace.getDocument();
      try {
        const table = await readCubeFile(file);
        if (workspace.state.getState().document === document) {
          addLut(document, file, table);
        }
      } catch (error) {
        workspace.reportFailure(file.name, error);
      }
    },
  };
}
