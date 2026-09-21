import type { Gpu } from "vgpu";
import {
  type ExportOptions,
  exportImage,
} from "@/app/editor/export/export-image";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createImageLoader } from "@/app/loaders/image";
import { createLoaderRegistry } from "@/app/loaders/registry";
import type {
  Adjustments,
  Details,
  Fill,
  Mask,
  Preview,
  ProcessingLayer,
  ToneCurve,
  Vignette,
} from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import type { ImageFrame } from "@/core/image/frame";
import { setAdjustments } from "@/features/adjustments/edits";
import { defaultAdjustments } from "@/features/adjustments/model";
import { resetColorMixer, setColorMixer } from "@/features/color-mixer/edits";
import {
  defaultMixer,
  type MixerChange,
  type MixerColor,
} from "@/features/color-mixer/model";
import { setDetails } from "@/features/details/edits";
import { defaultDetails } from "@/features/details/model";
import { setFill } from "@/features/fill/edits";
import {
  addLayer,
  deleteLayer,
  duplicateLayer,
  type LayerPlacement,
  moveLayer,
  setExposure,
  setLayer,
  setLayerMask,
  setMaskOperation,
} from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setVignette } from "@/features/vignette/edits";
import { defaultVignette } from "@/features/vignette/model";
import { setWhiteBalance } from "@/features/white-balance/edits";
import {
  createLayer,
  createMask,
  editEffect,
  findEffect,
} from "./editor/layers";
import type { Workspace } from "./workspace";

/** Imperative commands bound to an explicit workspace, usable without React. */
export function createControls(gpu: Gpu, workspace: Workspace) {
  const image = createImageLoader(gpu, workspace);
  const xmp = createCameraRawXmpLoader(workspace);
  const files = createLoaderRegistry(
    [xmp, image],
    () => workspace.state.getState().status === "ready",
  );

  return {
    openFiles: files.openFiles,
    openFile: (file: File) => files.openFiles([file]),
    loadImage: (file: File) => files.loadFile(image, file),
    loadUrl: image.loadUrl,
    importXmp: (file: File) => files.loadFile(xmp, file),
    setDetails(change: Partial<Details>, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "details", id, (id) =>
        setDetails(document, change, id),
      );
    },
    setAdjustments: (change: Partial<Adjustments>, id?: string) =>
      setAdjustments(workspace.getDocument(), change, id),
    setWhiteBalance: (change?: Partial<WhiteBalance>) =>
      setWhiteBalance(workspace.getDocument(), change),
    setToneCurve: (curve?: ToneCurve, id?: string) =>
      setToneCurve(workspace.getDocument(), curve, id),
    setColorMixer(color: MixerColor, change: MixerChange, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "color-mixer", id, (id) =>
        setColorMixer(document, color, change, id),
      );
    },
    resetColorMixer(id?: string) {
      const document = workspace.getDocument();
      const existing =
        id ?? findEffect(document.scene.getState().layers, "color-mixer")?.id;
      if (existing) {
        resetColorMixer(document, existing);
      }
    },
    setVignette(change: Partial<Vignette>, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "vignette", id, (id) =>
        setVignette(document, change, id),
      );
    },
    setFill(change: Partial<Fill>, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "fill", id, (id) => setFill(document, change, id));
    },
    addLayer(kind: ProcessingLayer["kind"], placement?: LayerPlacement) {
      const document = workspace.getDocument();
      if (kind !== "mask") {
        return addLayer(document, createLayer(kind), placement);
      }
      const scene = document.scene.getState();
      const [width, height] = document.resources.get(scene.layers[0].source)
        .image.size;
      const mask = createMask(defaultGradient([width, height]));
      return addLayer(document, mask, placement);
    },
    setLayer: (id: string, change: Parameters<typeof setLayer>[2]) =>
      setLayer(workspace.getDocument(), id, change),
    setExposure: (id: string, exposure: number) =>
      setExposure(workspace.getDocument(), id, exposure),
    setLayerMask: (id: string, mask: Mask) =>
      setLayerMask(workspace.getDocument(), id, mask),
    setMaskOperation: (id: string, operation: "add" | "subtract") =>
      setMaskOperation(workspace.getDocument(), id, operation),
    duplicateLayer: (id: string) => duplicateLayer(workspace.getDocument(), id),
    deleteLayer: (id: string) => deleteLayer(workspace.getDocument(), id),
    moveLayer: (id: string, index: number, parentId?: string) =>
      moveLayer(workspace.getDocument(), id, index, parentId),
    selectLayer: (id: string) => workspace.getDocument().selectLayer(id),
    setFrame(frame: ImageFrame) {
      const document = workspace.getDocument();
      document.edit({
        ...document.scene.getState(),
        frame: structuredClone(frame),
      });
    },
    setPreview: (change: Partial<Preview>) =>
      workspace.getDocument().preview.setState(change),
    beginEdit: () => workspace.getDocument().history.begin(),
    commitEdit: () => workspace.getDocument().history.commit(),
    cancelEdit: () => workspace.getDocument().history.cancel(),
    undo: () => workspace.getDocument().history.undo(),
    redo: () => workspace.getDocument().history.redo(),
    exportImage: (options?: ExportOptions) =>
      exportImage(gpu, workspace.getDocument(), options),
    getState() {
      const { file, document } = workspace.state.getState();
      const scene = document?.scene.getState();
      const layers = scene?.layers ?? [];
      return structuredClone({
        file,
        preview: document?.preview.getState(),
        documentId: document?.id,
        scene,
        selectedLayerId: document?.selection.getState().layerId,
        size: scene?.frame.size,
        frame: scene?.frame,
        adjustments: scene?.layers[0].adjustments ?? defaultAdjustments,
        whiteBalance: scene?.layers[0].whiteBalance,
        details: findEffect(layers, "details")?.details ?? defaultDetails,
        toneCurve: scene?.layers[0].toneCurve ?? defaultCurve,
        colorMixer:
          findEffect(layers, "color-mixer")?.colorMixer ?? defaultMixer,
        vignette: findEffect(layers, "vignette")?.vignette ?? defaultVignette,
        history: document?.history.status.getState() ?? {
          undoCount: 0,
          redoCount: 0,
        },
      });
    },
  };
}

declare global {
  interface Window {
    openlight: ReturnType<typeof createControls>;
  }
}
