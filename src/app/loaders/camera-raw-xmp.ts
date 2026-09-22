import { editEffect } from "@/app/editor/layers";
import type { Workspace } from "@/app/workspace";
import type { Adjustments, EditorDocument } from "@/core/document";
import { setAdjustments } from "@/features/adjustments/edits";
import {
  type CameraRawXmp,
  isCameraRawXmp,
  readCameraRawXmp,
} from "@/features/camera-raw-xmp/xmp";
import { detailsChange, setDetails } from "@/features/details/edits";
import { parse } from "@/lib/parse";
import type { FileLoader } from "./registry";

function toAdjustments(xmp: CameraRawXmp): Partial<Adjustments> {
  const adjustments: Partial<Adjustments> = {
    exposure: xmp.exposure2012,
    contrast: xmp.contrast2012,
    highlights: xmp.highlights2012,
    shadows: xmp.shadows2012,
    whites: xmp.whites2012,
    blacks: xmp.blacks2012,
    vibrance: xmp.vibrance,
    saturation: xmp.saturation,
  };
  return Object.fromEntries(
    Object.entries(adjustments).filter(([, value]) => value !== undefined),
  );
}

function applyClarity(document: EditorDocument, clarity: number) {
  parse(detailsChange, { clarity }, "Invalid detail adjustment");
  const scene = document.scene.getState();
  if (
    clarity === 0 &&
    !scene.layers.some((layer) => layer.kind === "details")
  ) {
    return;
  }
  editEffect(document, "details", undefined, (id) =>
    setDetails(document, { clarity }, id),
  );
}

export function createCameraRawXmpLoader(workspace: Workspace): FileLoader {
  return {
    kind: "settings",
    accepts: isCameraRawXmp,
    async load(file) {
      if (!(file instanceof File)) {
        throw new Error("importXmp requires a File.");
      }
      const document = workspace.getDocument();
      const xmp = readCameraRawXmp(await file.text());
      const adjustments = toAdjustments(xmp);
      if (workspace.state.getState().document !== document) {
        return;
      }
      document.history.commit();
      document.history.begin();
      try {
        setAdjustments(document, adjustments);
        if (xmp.clarity2012 !== undefined) {
          applyClarity(document, xmp.clarity2012);
        }
        document.history.commit();
      } catch (error) {
        document.history.cancel();
        throw error;
      }
    },
  };
}
