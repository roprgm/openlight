import type { Gpu, Target, Timer } from "vgpu";
import {
  type BrushStroke,
  hasPaint,
  type MaskLayer,
  type PaintLayer,
  paintingOf,
  type RemoveField,
  type RemovePatch,
  removePatches,
  type Scene,
  walkLayers,
} from "@/core/document";
import type { ImageSource, WhiteBalance } from "@/core/image";
import type { Point } from "@/core/image/frame";
import { createFieldStore, type FieldLattice } from "./fields";
import { createRenderGraph } from "./graph";
import { createMaskCoverage } from "./mask";
import { createPatchRaster, type PatchInput } from "./mask/patches";
import { input, type RenderImage } from "./node";
import {
  type AcceptPainting,
  createPaintRaster,
  type PaintInput,
} from "./paint";
import { createProxy } from "./proxy";
import { createStrokes } from "./strokes";

export { curveInput, mixAdjustment } from "./blend";
export {
  type Clipping,
  type CoverageRegion,
  createDisplay,
  type MaskOverlay,
  renderBitmap,
  renderCoverage,
  type View,
} from "./display";
export type { FieldLattice } from "./fields";
export type { PatchInput } from "./mask/patches";
export {
  input,
  merge,
  type NodeDefinition,
  node,
  pipeline,
  type RenderImage,
  type RenderInput,
  type RenderNode,
  type RenderStep,
  type Scale,
  sourceSize,
  split,
} from "./node";
export type { PaintInput } from "./paint";
export { transformImage } from "./transform";
export { createRenderGraph };

export type Composition = {
  inputId?: string;
  /** The mask whose ranges' image, the one below it, to keep for picking colors from it. */
  rangeSourceId?: string;
  /** Keep one stable composition instance and its render-graph resources reusable. */
  retain: (id: string) => void;
  /**
   * A mask's coverage over `below`, the image it applies to, when a brush or range takes part;
   * gradients alone leave it to the mix pass.
   */
  coverage: (layer: MaskLayer, below: RenderImage) => RenderImage | undefined;
  /** Rasterized paint of a paint layer, prepared before composition. */
  paint: (layer: PaintLayer) => PaintInput | undefined;
  /** Rasterized coverage of an effect's own stroke, such as a Healing patch. */
  patch: (id: string, strokes: readonly BrushStroke[]) => PatchInput;
  /** The Remove field a patch shows, when the renderer holds it. */
  field: (patch: RemovePatch) => PatchField | undefined;
  /** Keeps a Remove field this render synthesizes for a patch, for the renders after it. */
  keepField: (
    patch: RemovePatch,
    lattice: FieldLattice,
    texels: RenderImage,
  ) => void;
};

/** A Remove field a render shows. */
export type PatchField = { texels: RenderImage; lattice: FieldLattice };

/** App composition describes requested outputs; the engine owns their storage. */
export type SceneProcessing = (
  source: RenderImage,
  scene: Scene,
  composition: Composition,
) => {
  full: RenderImage;
  output: RenderImage;
  input?: RenderImage;
  rangeSource?: RenderImage;
};

type RenderRequest = {
  scene: Scene;
  inputId?: string;
  rangeSourceId?: string;
  /** Source pixels per texel of the composition's source; above 1 renders a reduced proxy. */
  factor: number;
  /** An open gesture, which renders at the display's density even while a Remove field waits. */
  interactive: boolean;
};

function sameBalance(a: WhiteBalance | undefined, b: WhiteBalance | undefined) {
  return a?.temperature === b?.temperature && a?.tint === b?.tint;
}

/** A renderer's timer, and where it reads what the document stores outside the scene, by the IDs the scene names. */
export type RendererOptions = {
  timer?: Timer;
  /** The settled pixels a paint layer's or brush mask's `raster` names. */
  paintPixels?: (id: string) => Blob;
  /** The Remove field the document saved under an ID, once synthesized. */
  field?: (id: string) => RemoveField | undefined;
  /** Receives each Remove field the renderer synthesizes, read back; without it nothing is read back. */
  saveField?: (id: string, field: RemoveField) => void;
};

/**
 * Owns scene passes, mask and paint rasters, Remove fields, the proxy, and intermediate textures for
 * one decoded source.
 */
export function createRenderer(
  gpu: Gpu,
  resource: ImageSource,
  compose: SceneProcessing,
  {
    timer,
    paintPixels = () => {
      throw Error("This renderer has no settled paint.");
    },
    field: savedField = () => undefined,
    saveField,
  }: RendererOptions = {},
) {
  const source = resource.image;
  const graph = createRenderGraph(gpu, timer);
  const strokes = createStrokes(gpu);
  const brushes = createPaintRaster(gpu, strokes, "r8unorm");
  const masks = createMaskCoverage(brushes);
  const patches = createPatchRaster(gpu, strokes);
  const paints = createPaintRaster(gpu, strokes, "rgba8unorm");
  const fields = createFieldStore(gpu);
  const proxy = createProxy(gpu);
  const release = resource.retain();
  const raw = resource.raw?.createPass();
  let full = source;
  const listeners = new Set<() => void>();
  let rendered = false;
  let output = source;
  let inspected: { id: string; image: Target } | undefined;
  let kept: { id: string; image: Target } | undefined;
  /** Mask coverage the graph rendered for the overlay and thumbnails, by layer ID. */
  let shown = new Map<string, Target>();
  let balance = resource.raw?.asShot;
  /** Counts developments, so the proxy follows white-balance changes. */
  let version = 0;
  let displayScale = 1;
  let last: RenderRequest | undefined;
  let next: RenderRequest | undefined;
  let pending: Promise<void> | undefined;
  /** A raster being read back, a painting to settle or a Remove field to save; nothing renders meanwhile. */
  let settling: Promise<unknown> | undefined;
  /** Readbacks of synthesized fields in flight, by ID, which finish even once the renderer closes. */
  const capturing = new Map<string, Promise<RemoveField | undefined>>();
  let disposed = false;
  let instances = new Set<string>();
  function render(request: RenderRequest) {
    const { scene, inputId, rangeSourceId, factor } = request;
    if (
      last &&
      last.scene === scene &&
      last.inputId === inputId &&
      last.rangeSourceId === rangeSourceId &&
      last.factor === factor
    ) {
      return;
    }
    const active = new Set<string>();
    const developed = raw?.render() ?? source;
    // Every brush and paint layer updates once, bypassed or not, so hidden layers keep their rasters.
    for (const { layer } of walkLayers(scene.layers)) {
      if (layer.kind === "mask" && layer.mask.kind === "brush") {
        brushes.draw(layer.id, layer.mask, developed.size);
      }
      if (layer.kind === "paint") {
        paints.draw(layer.id, layer, developed.size);
      }
    }
    // Remove fields stay while their patches do, shown or not.
    for (const { patch } of removePatches(scene.layers)) {
      fields.retain(patch.field);
    }
    const image =
      factor > 1 ? proxy.render(developed, factor, version) : input(developed);
    const covered = new Map<string, RenderImage>();
    // Read brush views after every raster has updated, including inactive submasks.
    for (const { layer } of walkLayers(scene.layers)) {
      if (
        layer.kind === "mask" &&
        layer.mask.kind === "brush" &&
        hasPaint(layer.mask)
      ) {
        const coverage = brushes.coverage(layer.id);
        if (coverage) covered.set(layer.id, coverage);
      }
    }
    const syntheses: {
      id: string;
      lattice: FieldLattice;
      texels: RenderImage;
    }[] = [];
    const images = compose(image, scene, {
      inputId,
      rangeSourceId,
      retain: (id) => active.add(id),
      coverage: (layer, below) =>
        masks.coverage(layer, below, {
          retain: (id) => active.add(id),
          show: (id, coverage) => covered.set(id, coverage),
        }),
      paint: (layer) => paints.input(layer),
      patch: (id, strokes) => patches.patch(id, strokes, developed.size),
      // Patches that share a field, such as duplicates, show the one this render synthesizes.
      field: (patch) =>
        syntheses.find(({ id }) => id === patch.field) ??
        fields.get(patch.field),
      keepField: (patch, lattice, texels) =>
        syntheses.push({ id: patch.field, lattice, texels }),
    });
    for (const id of instances) {
      if (!active.has(id)) graph.release(`${id}/`);
    }
    instances = active;
    // The stroke buffer goes last, once the others let go of the strokes they left open.
    masks.sweep();
    patches.sweep();
    paints.sweep();
    strokes.sweep();
    // The inspected input goes first, so the image it reads is let go once the composition is done
    // with it; the two images every render shows, the range source, and coverage follow.
    const inputs = images.input ? [images.input] : [];
    const sources = images.rangeSource ? [images.rangeSource] : [];
    const targets = graph.render([
      ...inputs,
      images.full,
      images.output,
      ...sources,
      ...covered.values(),
      ...syntheses.map(({ texels }) => texels),
    ]);
    const [inputTarget] = targets;
    [full, output] = targets.slice(inputs.length);
    const [sourceTarget] = targets.slice(inputs.length + 2);
    const coverages = targets.slice(
      inputs.length + 2 + sources.length,
      inputs.length + 2 + sources.length + covered.size,
    );
    const synthesized = targets.slice(targets.length - syntheses.length);
    for (const [i, { id, lattice }] of syntheses.entries()) {
      fields.keep(id, lattice, synthesized[i]);
    }
    fields.sweep();
    if (saveField && syntheses.length) {
      capture(syntheses.map(({ id }) => id));
    }
    inspected =
      inputId && images.input ? { id: inputId, image: inputTarget } : undefined;
    kept =
      rangeSourceId && images.rangeSource
        ? { id: rangeSourceId, image: sourceTarget }
        : undefined;
    shown = new Map([...covered.keys()].map((id, i) => [id, coverages[i]]));
    rendered = true;
    last = request;
    for (const listener of listeners) {
      listener();
    }
  }
  /** The raster of a paint layer's color or of a brush mask's coverage. */
  function paintRaster(id: string) {
    return paints.get(id) ? paints : brushes;
  }
  /** Remove fields to load before rendering: saved ones the renderer holds nothing for. */
  function staleFields(scene: Scene) {
    const stale = new Map<string, RemoveField>();
    for (const { patch } of removePatches(scene.layers)) {
      const saved = savedField(patch.field);
      if (saved && !fields.get(patch.field)) {
        stale.set(patch.field, saved);
      }
    }
    return [...stale];
  }
  /**
   * Reads the fields a render synthesized back for the document, rendering nothing meanwhile, so no
   * render replaces one first. A field whose readback fails stays held, and `captureFields` reads it
   * again for a snapshot, which reports the failure.
   */
  function capture(ids: readonly string[]) {
    let reading: Promise<unknown> = Promise.resolve();
    for (const id of ids) {
      const read = reading.then(() => fields.read(id));
      capturing.set(id, read);
      reading = read
        .then((field) => field && saveField?.(id, field))
        .catch(() => {})
        .finally(() => {
          if (capturing.get(id) === read) {
            capturing.delete(id);
          }
        });
    }
    const done = reading;
    settling = done;
    void done.then(() => {
      if (settling === done) {
        settling = undefined;
      }
    });
  }
  /** Whether a Remove patch waits for a field neither this renderer nor the document holds; only a full render synthesizes one. */
  function waitingField(scene: Scene) {
    return [...removePatches(scene.layers)].some(
      ({ patch }) => !fields.get(patch.field) && !savedField(patch.field),
    );
  }
  /** Source pixels per texel that the display's density asks for. */
  function displayFactor() {
    return Math.max(1, Math.floor(1 / displayScale));
  }
  /** Paintings whose rasters must load settled pixels before they draw. */
  function stalePaint(scene: Scene) {
    const stale = [];
    for (const { layer } of walkLayers(scene.layers)) {
      const painting = paintingOf(layer);
      const rasters = layer.kind === "paint" ? paints : brushes;
      if (painting && rasters.needsBase(layer.id, painting)) {
        stale.push({ id: layer.id, raster: painting.raster, rasters });
      }
    }
    return stale;
  }
  /**
   * Renders the latest request once what it waits for is ready: a settle, a RAW development, whose
   * calibration alone crosses the worker, settled paint, or Remove fields to load.
   */
  async function develop() {
    while (next && !disposed) {
      const request = next;
      next = undefined;
      const { scene } = request;
      if (settling) {
        await settling;
      }
      if (disposed) return;
      if (next) continue;
      const selected = scene.layers[0].whiteBalance ?? resource.raw?.asShot;
      if (raw && selected && !sameBalance(balance, selected)) {
        await raw.prepare(selected);
        if (disposed) {
          return;
        }
        balance = selected;
        version++;
      }
      for (const { id, raster, rasters } of stalePaint(scene)) {
        await rasters.loadBase(id, raster, paintPixels(raster), source.size);
        if (disposed) {
          return;
        }
      }
      for (const [id, field] of staleFields(scene)) {
        await fields.load(id, field);
        if (disposed) {
          return;
        }
      }
      if (!next) {
        render(request);
      }
    }
  }
  /**
   * Renders reduce the source to the display's density, a proxy, except that a Remove patch waiting
   * for its field renders in full outside a gesture, since only a full render synthesizes one. `inputId`
   * keeps a layer's curve input, and `rangeSourceId` a mask's range source, for reading them.
   */
  async function update(
    scene: Scene,
    inputId?: string,
    interactive = false,
    rangeSourceId?: string,
  ): Promise<void> {
    if (disposed) {
      throw Error("Renderer is closed.");
    }
    const factor = !interactive && waitingField(scene) ? 1 : displayFactor();
    const request = { scene, inputId, rangeSourceId, factor, interactive };
    // Renders wait, in order, for a settle, a RAW development, or settled paint and fields to load.
    if (
      !raw &&
      !pending &&
      !settling &&
      !stalePaint(scene).length &&
      !staleFields(scene).length
    ) {
      render(request);
      return;
    }
    next = request;
    pending ??= develop()
      .catch((error) => {
        if (!next) {
          throw error;
        }
      })
      .finally(() => {
        pending = undefined;
        if (next && !disposed) {
          const { scene, inputId, interactive, rangeSourceId } = next;
          return update(scene, inputId, interactive, rangeSourceId);
        }
      });
    return pending;
  }

  /** Runs a readback once renders in flight finish, and renders nothing until it does. */
  async function hold<T>(read: () => Promise<T>) {
    while (pending || settling) {
      await (pending ?? settling);
    }
    if (disposed) return undefined;
    const reading = read();
    settling = reading;
    try {
      return await reading;
    } finally {
      settling = undefined;
    }
  }

  function releaseResources() {
    graph.dispose();
    masks.dispose();
    patches.dispose();
    paints.dispose();
    fields.dispose();
    strokes.dispose();
    proxy.dispose();
    raw?.dispose();
    release();
  }

  return {
    fullImage: () => full,
    outputImage: () => output,
    inputImage: (id: string) =>
      inspected?.id === id ? inspected.image : undefined,
    /** The image below a mask, which its ranges read, while an update keeps it. */
    rangeSource: (id: string) => (kept?.id === id ? kept.image : undefined),
    /**
     * A raster by ID and where it sits in the photo: a mask's coverage, for the display overlay and
     * thumbnails, a Healing patch's, or a paint layer's.
     */
    coverage(id: string): { target: Target; origin: Point } | undefined {
      const target = shown.get(id) ?? paints.get(id);
      return target ? { target, origin: [0, 0] } : patches.raster(id);
    },
    /**
     * Device pixels shown per source pixel; renders reduce the source to about this density. The last
     * scene renders again, after the frame that reports it, once the density asks for another reduction.
     */
    setDisplayScale(scale: number) {
      if (!Number.isFinite(scale) || scale <= 0) {
        return;
      }
      displayScale = scale;
      const shown = last;
      if (!shown || shown.factor === displayFactor()) {
        return;
      }
      queueMicrotask(() => {
        if (!disposed && last === shown) {
          void update(
            shown.scene,
            shown.inputId,
            shown.interactive,
            shown.rangeSourceId,
          );
        }
      });
    },
    inspect: () => ({
      ...graph.inspect(),
      stamped: strokes.stamped(),
      rasters: [
        ...masks.inspect(),
        ...patches.inspect(),
        ...paints.inspect(),
        ...fields.inspect(),
        ...strokes.inspect(),
      ],
    }),
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (rendered) {
        listener();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    update,
    /**
     * Reads a paint layer's raster once renders in flight finish, holding back the next ones, so its
     * strokes, scene, and cached raster settle together before rendering resumes.
     */
    settle(id: string, accept: AcceptPainting) {
      return hold(() =>
        paintRaster(id).settle(id, (painting) =>
          disposed ? undefined : accept(painting),
        ),
      );
    },
    /**
     * The fields among `ids` that the document saved or this renderer holds, once renders and readbacks
     * in flight finish, saving those the document still waits for; rejects when a readback fails. Once
     * the renderer closes, it gives what its readbacks in flight read, and rejects for a field it held
     * that none was reading.
     */
    async captureFields(ids: readonly string[]) {
      const inFlight = ids.flatMap((id) => {
        const read = capturing.get(id);
        return read ? [[id, read] as const] : [];
      });
      const unread = ids.some(
        (id) => !capturing.has(id) && fields.get(id) && !savedField(id),
      );
      const found = await hold(async () => {
        const found = new Map<string, RemoveField>();
        for (const id of ids) {
          const saved = savedField(id);
          if (saved) {
            found.set(id, saved);
            continue;
          }
          const read = await fields.read(id);
          if (read) {
            found.set(id, read);
            saveField?.(id, read);
          }
        }
        return found;
      });
      if (found) {
        return found;
      }
      if (unread) {
        throw Error(
          "The photo closed before its Remove fields were read back.",
        );
      }
      const read = new Map<string, RemoveField>();
      for (const [id, reading] of inFlight) {
        const field = await reading;
        if (field) {
          read.set(id, field);
        }
      }
      return read;
    },
    dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      listeners.clear();
      // Banded transfers keep their targets until their last GPU operation finishes.
      const finishing = pending ?? settling;
      if (finishing) {
        void finishing.then(releaseResources, releaseResources);
      } else {
        releaseResources();
      }
    },
  };
}
