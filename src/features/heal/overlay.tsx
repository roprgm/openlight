import { useEffect, useMemo, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useScene } from "@/components/editor/session";
import { findLayer, type HealAlgorithm } from "@/core/document";
import { createPixelSource } from "@/core/image";
import type { Point } from "@/core/image/frame";
import {
  addHealPatch,
  extendHealPatch,
  setAiResult,
  setHealSource,
} from "./edits";
import { generateMigan } from "./migan";
import { useHealing } from "./mode";
import { HealPatchHitTarget, HealPatchOutline } from "./outline";
import { createHealSearch } from "./source";

/** Paints ordinary brush strokes; only the donor search and patch edits belong to Heal. */
export function HealOverlay({
  onCreate,
  onDone,
}: {
  onCreate: () => string;
  onDone: () => void;
}) {
  const document = useDocument();
  const renderer = useRenderer();
  const mapping = useDocumentMapping();
  const gpu = useGpu();
  const search = useMemo(() => createHealSearch(gpu), [gpu]);
  const { algorithm, selectedPatch, selectPatch, hoveredPatch } = useHealing();
  const [source, setSource] = useState<Point>();
  const [drawingPatch, setDrawingPatch] = useState<string>();
  const [resolvingSource, setResolvingSource] = useState<string>();
  const layer = useScene((scene) =>
    findLayer(scene.layers, document.selection.getState().layerId),
  );
  const healLayer = layer?.kind === "heal" ? layer : undefined;
  const patches = healLayer?.patches ?? [];
  const hovered = patches.some((patch) => patch.id === hoveredPatch)
    ? hoveredPatch
    : undefined;
  const visiblePatch = drawingPatch ?? hovered ?? selectedPatch;
  const pending = useRef<
    | {
        layer: string;
        patch: string;
        automatic: boolean;
        algorithm: HealAlgorithm;
      }
    | undefined
  >(undefined);
  function selected() {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    if (layer?.kind !== "heal") {
      throw Error("Select a Heal layer.");
    }
    return layer;
  }
  useEffect(() => {
    const layer = findLayer(
      document.scene.getState().layers,
      document.selection.getState().layerId,
    );
    const before =
      layer?.kind === "heal" ? undefined : document.scene.getState();
    if (before) {
      onCreate();
    }
    const unsubscribe = document.selection.subscribe(() => {
      const layer = findLayer(
        document.scene.getState().layers,
        document.selection.getState().layerId,
      );
      if (layer?.kind !== "heal") {
        onDone();
      }
    });
    return () => {
      unsubscribe();
      if (before) {
        document.history.drop(before);
      }
    };
  }, []);
  useEffect(() => () => search.dispose(), [search]);
  async function complete(signal: AbortSignal) {
    const current = pending.current;
    try {
      if (!current || signal.aborted) {
        return;
      }
      const scene = document.scene.getState();
      const patch = selected().patches.find(
        (patch) => patch.id === current.patch,
      );
      if (!patch) {
        return;
      }
      await renderer.update(scene, current.layer, current.algorithm !== "ai");
      if (signal.aborted) {
        return;
      }
      const image = renderer.inputImage(current.layer);
      if (!image) {
        throw Error("Heal input is unavailable.");
      }
      const dimensions = document.resources.get(scene.layers[0].source).image
        .size;
      if (current.algorithm === "ai") {
        const generated = await generateMigan(
          gpu,
          image,
          dimensions,
          patch.stroke,
        );
        if (document.scene.getState() !== scene || signal.aborted) return;
        const resource = createPixelSource(gpu, generated.result);
        const result = document.resources.add(
          new File([], "AI Remove result"),
          resource,
        );
        setAiResult(
          document,
          current.layer,
          current.patch,
          result,
          generated.origin,
          generated.extent,
        );
        return;
      }
      if (!current.automatic) return;
      const offset = await search.find(image, dimensions, patch.stroke);
      // Undo, selection, or document replacement during readback must not resurrect a patch.
      if (
        document.scene.getState() !== scene ||
        signal.aborted ||
        !document.history.status.getState().editing
      ) {
        return;
      }
      setHealSource(document, current.layer, current.patch, offset);
    } finally {
      setResolvingSource((id) => (id === current?.patch ? undefined : id));
    }
  }
  const marker = source && mapping.toScreen(source);
  return (
    <BrushCanvas
      label="Healing canvas"
      erase={false}
      onStart={(stroke) => {
        const layer = selected();
        const [x, y] = stroke.points[0];
        const offset: Point = source ? [source[0] - x, source[1] - y] : [0, 0];
        const patch = addHealPatch(
          document,
          layer.id,
          { ...stroke, flow: 1 },
          offset,
          algorithm,
        );
        setDrawingPatch(patch);
        setResolvingSource(
          algorithm === "healing" && !source ? patch : undefined,
        );
        selectPatch(patch);
        pending.current = {
          layer: layer.id,
          patch,
          automatic: !source,
          algorithm,
        };
      }}
      onExtend={(points) => {
        const id = pending.current?.layer;
        if (id) {
          extendHealPatch(document, id, points);
        }
      }}
      onComplete={complete}
      onFinish={(committed) => {
        setDrawingPatch(undefined);
        if (!committed) setResolvingSource(undefined);
      }}
      onPickSource={algorithm === "ai" ? undefined : setSource}
      onDone={onDone}
    >
      {healLayer && patches.length > 0 && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          {patches.map((patch) => {
            const visible = visiblePatch === patch.id;
            return visible ? (
              <g key={`outline-${patch.id}`} data-heal-patch={patch.id}>
                <HealPatchOutline
                  layer={healLayer.id}
                  patch={patch}
                  mapping={mapping}
                  showSource={
                    patch.algorithm === "healing" &&
                    patch.id !== drawingPatch &&
                    patch.id !== resolvingSource
                  }
                />
              </g>
            ) : null;
          })}
          {patches.map((patch) => (
            <HealPatchHitTarget
              key={`hit-${patch.id}`}
              patch={patch}
              mapping={mapping}
              onSelect={selectPatch}
            />
          ))}
        </svg>
      )}
      {algorithm !== "ai" && marker && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <circle
            cx={marker[0]}
            cy={marker[1]}
            r="8"
            fill="none"
            stroke="white"
          />
          <path
            d={`M${marker[0] - 12} ${marker[1]}h24M${marker[0]} ${marker[1] - 12}v24`}
            stroke="white"
          />
        </svg>
      )}
      {algorithm !== "ai" && source && (
        <button
          type="button"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setSource(undefined)}
          className="absolute right-3 bottom-3 rounded-full bg-neutral-800/80 px-3 py-1.5 text-white"
        >
          Automatic source
        </button>
      )}
    </BrushCanvas>
  );
}
