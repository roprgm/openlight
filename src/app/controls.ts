import type { Gpu } from "vgpu";
import {
  createDraftStore,
  type DraftStore,
  openDraft,
} from "@/app/draft/store";
import {
  type ExportOptions,
  exportImage,
} from "@/app/editor/export/export-image";
import { createCameraRawXmpLoader } from "@/app/loaders/camera-raw-xmp";
import { createImageLoader } from "@/app/loaders/image";
import { createLutLoader } from "@/app/loaders/lut";
import { createLoaderRegistry } from "@/app/loaders/registry";
import { createSceneLoader, writeSceneFile } from "@/app/loaders/scene";
import type {
  Adjustments,
  Blend,
  BrushStroke,
  Details,
  Fill,
  Grain,
  HealMode,
  Mask,
  PaintStroke,
  Preview,
  ToneCurve,
  Vignette,
} from "@/core/document";
import type { WhiteBalance } from "@/core/image";
import { decode } from "@/core/image/decode";
import type { ImageFrame, Point } from "@/core/image/frame";
import { setAdjustments, setExposure } from "@/features/adjustments/edits";
import { defaultAdjustments } from "@/features/adjustments/model";
import { resetColorMixer, setColorMixer } from "@/features/color-mixer/edits";
import {
  defaultMixer,
  type MixerChange,
  type MixerColor,
} from "@/features/color-mixer/model";
import { applyCrop } from "@/features/crop/edits";
import { setDetails } from "@/features/details/edits";
import { defaultDetails } from "@/features/details/model";
import { setFill } from "@/features/fill/edits";
import { setGrain } from "@/features/grain/edits";
import { defaultGrain } from "@/features/grain/model";
import {
  addHealPatch,
  addHealStroke,
  addRemovePatch,
  setHealSource,
} from "@/features/heal/edits";
import {
  addLayer,
  deleteLayer,
  duplicateLayer,
  type LayerPlacement,
  moveLayer,
  setLayer,
  setLayerMask,
  setMaskOperation,
} from "@/features/layers/edits";
import { defaultGradient } from "@/features/layers/gradient";
import { addPaintStroke, setPaintBlend } from "@/features/paint/edits";
import { defaultCurve } from "@/features/tone-curves/curve";
import { setToneCurve } from "@/features/tone-curves/edits";
import { setVignette } from "@/features/vignette/edits";
import { defaultVignette } from "@/features/vignette/model";
import { autoWhiteBalance } from "@/features/white-balance/auto";
import { setWhiteBalance } from "@/features/white-balance/edits";
import { type Command, runCommand } from "./commands";
import {
  createLayer,
  createMask,
  type DefaultEffect,
  editEffect,
  findEffect,
} from "./editor/layers";
import type { Workspace } from "./workspace";

/** Imperative commands bound to an explicit workspace, usable without React. */
export function createControls(
  gpu: Gpu,
  workspace: Workspace,
  drafts: DraftStore = createDraftStore(),
) {
  const image = createImageLoader(gpu, workspace);
  const xmp = createCameraRawXmpLoader(workspace);
  const scene = createSceneLoader(gpu, workspace);
  const lut = createLutLoader(workspace);
  const files = createLoaderRegistry(
    [scene, xmp, lut, image],
    () => workspace.state.getState().status === "ready",
  );

  return {
    openFiles: files.openFiles,
    openFile: (file: File) => files.openFiles([file]),
    loadImage: (file: File) => files.loadFile(image, file),
    loadUrl: image.loadUrl,
    loadScene: (file: File) => files.loadFile(scene, file),
    /** Opens the stored draft like a scene file; a draft that fails to open leaves the workspace in its error state. */
    async recoverDraft() {
      const draft = await drafts.read();
      if (!draft) {
        throw Error("There is no draft to recover.");
      }
      await workspace.open(draft.record.name, () =>
        openDraft(draft, (file) => decode(gpu, file)),
      );
    },
    discardDraft: () => drafts.discard(),
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
    autoWhiteBalance: () => autoWhiteBalance(workspace.getDocument(), gpu),
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
    setGrain(change: Partial<Grain>, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "grain", id, (id) => setGrain(document, change, id));
    },
    setFill(change: Partial<Fill>, id?: string) {
      const document = workspace.getDocument();
      editEffect(document, "fill", id, (id) => setFill(document, change, id));
    },
    addHealPatch: (
      id: string,
      stroke: BrushStroke,
      offset: Point,
      mode?: Exclude<HealMode, "remove">,
    ) => addHealPatch(workspace.getDocument(), id, stroke, offset, mode),
    addHealStroke: (id: string, patch: string, stroke: BrushStroke) =>
      addHealStroke(workspace.getDocument(), id, patch, stroke),
    addRemovePatch: (id: string, stroke: BrushStroke) =>
      addRemovePatch(workspace.getDocument(), id, stroke),
    setHealSource: (id: string, patchId: string, offset: Point) =>
      setHealSource(workspace.getDocument(), id, patchId, offset),
    addPaintStroke: (id: string, stroke: PaintStroke) =>
      addPaintStroke(workspace.getDocument(), id, stroke),
    setPaintBlend: (id: string, blend: Blend) =>
      setPaintBlend(workspace.getDocument(), id, blend),
    addLayer(kind: DefaultEffect | "mask", placement?: LayerPlacement) {
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
    setFrame: (frame: ImageFrame) => applyCrop(workspace.getDocument(), frame),
    setPreview: (change: Partial<Preview>) =>
      workspace.getDocument().preview.setState(change),
    beginEdit: () => workspace.getDocument().history.begin(),
    commitEdit: () => workspace.getDocument().history.commit(),
    cancelEdit: () => workspace.getDocument().history.cancel(),
    undo: () => workspace.getDocument().history.undo(),
    redo: () => workspace.getDocument().history.redo(),
    /** Validates and runs a serializable command, returning the layer it edited. */
    run: (command: Command) => runCommand(workspace, command),
    exportImage: (options?: ExportOptions) =>
      exportImage(gpu, workspace.getDocument(), options),
    exportScene: () => writeSceneFile(workspace.getDocument()),
    getState() {
      const current = workspace.state.getState();
      const { file, document } = current;
      const scene = document?.scene.getState();
      const layers = scene?.layers ?? [];
      let failure: { file: string; error: string } | undefined;
      if (current.status === "error") {
        failure = { file: current.file, error: current.error };
      } else if (current.status === "ready") {
        failure = current.failure;
      }
      return structuredClone({
        file,
        failure,
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
        grain: findEffect(layers, "grain")?.grain ?? defaultGrain,
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
