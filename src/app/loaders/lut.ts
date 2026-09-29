import { createLutLayer, newLayerPlacement } from "@/app/editor/layers";
import type { Workspace } from "@/app/workspace";
import { addLayer } from "@/features/layers/edits";
import { isCubeFile, readCubeFile } from "@/features/lut/cube";
import type { FileLoader } from "./registry";

/** A `.cube` file adds a LUT layer where the Add menu places effects; one that can't be read shows beside the document. */
export function createLutLoader(workspace: Workspace): FileLoader {
  return {
    kind: "settings",
    accepts: isCubeFile,
    async load(file) {
      const document = workspace.getDocument();
      try {
        const { name, lut } = await readCubeFile(file);
        if (workspace.state.getState().document === document) {
          addLayer(
            document,
            createLutLayer(name, lut),
            newLayerPlacement(document),
          );
        }
      } catch (error) {
        workspace.reportFailure(file.name, error);
      }
    },
  };
}
