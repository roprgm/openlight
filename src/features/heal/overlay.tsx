import { useEffect, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import { type BrushStroke, findLayer, type Layer } from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useDisposable } from "@/hooks/use-disposable";
import {
  addHealPatch,
  addHealStroke,
  addRemovePatch,
  extendHealPatch,
  setHealSource,
} from "./edits";
import { useHealing } from "./mode";
import { dabTouchesImage, findHealPatch } from "./model";
import {
  HealPatchHitTarget,
  HealPatchOutline,
  HealStrokePreview,
} from "./outline";
import { createHealSearch } from "./source";

function isHealLayer(layer: Layer): layer is Extract<Layer, { kind: "heal" }> {
  return layer.kind === "heal";
}

/** Sends brush strokes to retouch edits and resolves Heal/Clone donors after painting. */
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
  const {
    brush,
    mode,
    source,
    setSource,
    selectedPatch,
    selectPatch,
    hoveredPatch,
  } = useHealing();
  const [drawingPatch, setDrawingPatch] = useState<string>();
  const [draft, setDraft] = useState<BrushStroke>();
  const [resolvingSource, setResolvingSource] = useState<string>();
  // A manual donor belongs to this visit to the tool.
  useEffect(() => () => setSource(undefined), [setSource]);
  const selectedHealLayer = useToolLayer({
    accepts: isHealLayer,
    create: onCreate,
    leave: onDone,
  });
  const layer = useSelectedLayer();
  const healLayer = layer && isHealLayer(layer) ? layer : undefined;
  const patches = healLayer?.patches ?? [];
  const selected = patches.find((patch) => patch.id === selectedPatch);
  const hovered = patches.some((patch) => patch.id === hoveredPatch)
    ? hoveredPatch
    : undefined;
  const visiblePatch = drawingPatch ?? hovered ?? selectedPatch;
  const pending = useRef<
    | { layer: string; stroke: BrushStroke; patch?: string }
    | {
        layer: string;
        mode: "heal" | "clone";
        patch: string;
        automatic: boolean;
      }
    | undefined
  >(undefined);
  async function complete(signal: AbortSignal) {
    const current = pending.current;
    try {
      if (
        !current ||
        "stroke" in current ||
        !current.automatic ||
        signal.aborted
      )
        return;
      const scene = document.scene.getState();
      const patch = findHealPatch(scene, current.layer, current.patch);
      if (!patch) return;
      await renderer.update(scene, current.patch, true);
      if (signal.aborted) return;
      const image = renderer.inputImage(current.patch);
      if (!image) throw Error("Heal input is unavailable.");
      const dimensions = document.resources.get(scene.layers[0].source).image
        .size;
      const offset = await search.find(image, dimensions, patch.strokes);
      // The stroke's group stays open through the search; undo or cancel aborts it and removes the patch.
      if (
        signal.aborted ||
        !findHealPatch(document.scene.getState(), current.layer, current.patch)
      ) {
        return;
      }
      setHealSource(document, current.layer, current.patch, offset);
    } finally {
      if (current && !("stroke" in current)) {
        setResolvingSource((id) => (id === current.patch ? undefined : id));
      }
    }
  }
  const marker = source && mapping.toScreen(source);
  return (
    <BrushCanvas
      label="Healing canvas"
      erase={false}
      editOnRelease={({ shift, alt }) =>
        mode === "remove" || Boolean(selected && (shift || alt))
      }
      onStart={(stroke, { shift, alt }) => {
        const layer = selectedHealLayer();
        if (!layer) return false;
        const [x, y] = stroke.points[0];
        const size = document.resources.get(
          document.scene.getState().layers[0].source,
        ).image.size;
        if (!dabTouchesImage([x, y], stroke.size / 2, size)) return false;
        // Keep the displayed feather when starting a stroke changes the patch selection.
        brush.update({ feather: stroke.feather });
        const painted = { ...stroke, flow: 1 };
        if (selected && (shift || alt)) {
          const stroke: BrushStroke = {
            ...painted,
            mode: alt ? "erase" : "paint",
          };
          pending.current = { layer: layer.id, patch: selected.id, stroke };
          setDraft(stroke);
          setDrawingPatch(selected.id);
          return true;
        }
        if (mode === "remove") {
          pending.current = { layer: layer.id, stroke: painted };
          setDraft(painted);
          selectPatch(undefined);
          return true;
        }
        const offset: Point = source ? [source[0] - x, source[1] - y] : [0, 0];
        const patch = addHealPatch(document, layer.id, painted, offset, mode);
        setDrawingPatch(patch);
        setResolvingSource(source ? undefined : patch);
        selectPatch(patch);
        pending.current = {
          layer: layer.id,
          mode,
          patch,
          automatic: !source,
        };
        return true;
      }}
      onExtend={(points) => {
        const current = pending.current;
        if (!current) return;
        if ("stroke" in current) {
          const stroke = {
            ...current.stroke,
            points: [...current.stroke.points, ...points],
          };
          pending.current = { ...current, stroke };
          setDraft(stroke);
          return;
        }
        extendHealPatch(document, current.layer, points);
      }}
      onComplete={complete}
      onFinish={(committed) => {
        const current = pending.current;
        if (current && "stroke" in current) {
          pending.current = undefined;
          setDraft(undefined);
          const scene = document.scene.getState();
          const available = current.patch
            ? findHealPatch(scene, current.layer, current.patch)
            : findLayer(scene.layers, current.layer)?.kind === "heal";
          if (committed && available) {
            if (current.patch) {
              addHealStroke(
                document,
                current.layer,
                current.patch,
                current.stroke,
              );
            } else {
              selectPatch(
                addRemovePatch(document, current.layer, current.stroke),
              );
            }
          }
        }
        setDrawingPatch(undefined);
        if (!committed) setResolvingSource(undefined);
      }}
      onPickSource={mode === "remove" || selected ? undefined : setSource}
      onDone={onDone}
    >
      {draft && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
        >
          <HealStrokePreview
            strokes={
              drawingPatch && selected ? [...selected.strokes, draft] : [draft]
            }
          />
        </svg>
      )}
      {healLayer && patches.length > 0 && (
        <svg
          aria-hidden="true"
          className="absolute inset-0 size-full overflow-visible"
          style={{ pointerEvents: "none" }}
        >
          {patches.map(
            (patch) =>
              visiblePatch === patch.id &&
              !(draft && drawingPatch === patch.id) && (
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
      {marker && mode !== "remove" && (
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
    </BrushCanvas>
  );
}
