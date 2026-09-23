import type { EditorDocument } from "@/core/document";
import { type ImageFrame, validateFrame } from "@/core/image/frame";

/** Replaces the crop, rotation, and flip as one edit, respecting an open history group; the frame is copied. */
export function applyCrop(document: EditorDocument, frame: ImageFrame) {
  document.edit({ ...document.scene.getState(), frame: validateFrame(frame) });
}
