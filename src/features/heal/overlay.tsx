import { useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import type { Layer } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useDisposable } from "@/hooks/use-disposable";
import { addHealPatch, extendHealPatch, setHealSource } from "./edits";
import { useHealing } from "./mode";
import { dabTouchesImage, findHealPatch } from "./model";
import { HealPatchHitTarget, HealPatchOutline } from "./outline";
import { createHealSearch } from "./source";

function isHealLayer(layer: Layer): layer is Extract<Layer, { kind: "heal" }> {
  return layer.kind === "heal";
}

/** Paints ordinary brush strokes; only the donor search and patch edits belong to Heal. */
export function HealOverlay({
  onCreate,
  onDone,
}: {
  onCreate: () => void;
  onDone: () => void;
}) {
  const document = useDocument();
  const renderer = useRenderer();
  const mapping = useDocumentMapping();
  const gpu = useGpu();
  const search = useDisposable(() => createHealSearch(gpu), [gpu]);
  const { feather, selectedPatch, selectPatch, hoveredPatch } = useHealing();
  const [source, setSource] = useState<Point>();
  const [drawingPatch, setDrawingPatch] = useState<string>();
  const [resolvingSource, setResolvingSource] = useState<string>();
  const selectedHealLayer = useToolLayer({
    accepts: isHealLayer,
    create: onCreate,
    leave: onDone,
  });
  const layer = useSelectedLayer();
  const healLayer = layer && isHealLayer(layer) ? layer : undefined;
  const patches = healLayer?.patches ?? [];
  const hovered = patches.some((patch) => patch.id === hoveredPatch)
    ? hoveredPatch
    : undefined;
  const visiblePatch = drawingPatch ?? hovered ?? selectedPatch;
  const pending = useRef<
    { layer: string; patch: string; automatic: boolean } | undefined
  >(undefined);
  async function complete(signal: AbortSignal) {
    const current = pending.current;
    try {
      if (!current?.automatic || signal.aborted) return;
      const scene = document.scene.getState();
      const patch = findHealPatch(scene, current.layer, current.patch);
      if (!patch) return;
      await renderer.update(scene, current.patch, true);
      if (signal.aborted) return;
      const image = renderer.inputImage(current.patch);
      if (!image) throw Error("Heal input is unavailable.");
      const dimensions = document.resources.get(scene.layers[0].source).image
        .size;
      const offset = await search.find(image, dimensions, patch.stroke);
      // The stroke's group stays open through the search; undo or cancel aborts it and removes the patch.
      if (
        signal.aborted ||
        !findHealPatch(document.scene.getState(), current.layer, current.patch)
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
      feather={feather}
      onStart={(stroke) => {
        const layer = selectedHealLayer();
        if (!layer) return false;
        const [x, y] = stroke.points[0];
        const size = document.resources.get(
          document.scene.getState().layers[0].source,
        ).image.size;
        if (!dabTouchesImage([x, y], stroke.size / 2, size)) return false;
        const offset: Point = source ? [source[0] - x, source[1] - y] : [0, 0];
        const patch = addHealPatch(
          document,
          layer.id,
          { ...stroke, flow: 1 },
          offset,
        );
        setDrawingPatch(patch);
        setResolvingSource(source ? undefined : patch);
        selectPatch(patch);
        pending.current = { layer: layer.id, patch, automatic: !source };
        return true;
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
      onPickSource={setSource}
      onDone={onDone}
    >
      {healLayer && patches.length > 0 && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          {patches.map(
            (patch) =>
              visiblePatch === patch.id && (
                <g key={`outline-${patch.id}`} data-heal-patch={patch.id}>
                  <HealPatchOutline
                    layer={healLayer.id}
                    patch={patch}
                    showSource={
                      patch.id !== drawingPatch && patch.id !== resolvingSource
                    }
                    interactive={
                      patch.id === selectedPatch && patch.id !== drawingPatch
                    }
                  />
                </g>
              ),
          )}
          {patches.map(
            (patch) =>
              patch.id !== selectedPatch && (
                <HealPatchHitTarget
                  key={`hit-${patch.id}`}
                  patch={patch}
                  onSelect={selectPatch}
                />
              ),
          )}
        </svg>
      )}
      {marker && (
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
      {source && (
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
