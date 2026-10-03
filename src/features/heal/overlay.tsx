import { type PointerEvent, useEffect, useRef, useState } from "react";
import { useGpu } from "vgpu-react";
import { BrushCanvas } from "@/components/editor/brush-canvas";
import { useDocumentMapping } from "@/components/editor/mapping";
import { useRenderer } from "@/components/editor/pipeline";
import { useDocument, useSelectedLayer } from "@/components/editor/session";
import { useToolLayer } from "@/components/editor/tool-layer";
import { useViewport } from "@/components/editor/viewport";
import {
  type BrushStroke,
  findLayer,
  type HealPatch,
  type Layer,
} from "@/core/document";
import type { Point } from "@/core/image/frame";
import { useDisposable } from "@/hooks/use-disposable";
import { containsTarget } from "@/lib/dom";
import { anchorReach, HealAnchor } from "./anchor";
import {
  addHealPatch,
  addHealStroke,
  addRemovePatch,
  extendHealPatch,
  setHealSource,
} from "./edits";
import { useHealing } from "./mode";
import { dabTouchesImage, findHealPatch } from "./model";
import { HealPatchOutline, HealStrokePreview } from "./outline";
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
  const camera = useViewport();
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
  /** The patch whose handles show: the selected one, while its outline shows and no stroke draws on it. */
  const handled =
    selected && visiblePatch === selected.id && drawingPatch !== selected.id
      ? selected
      : undefined;
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
  /** Where a patch's first point shows, moved by `offset` for its source; none behind the horizon. */
  function firstShown(patch: HealPatch, offset: Point = [0, 0]) {
    const [x, y] = patch.strokes[0].points[0];
    return mapping.toScreen([x + offset[0], y + offset[1]]);
  }
  /**
   * A press on the first point of a patch that isn't selected selects the topmost one instead of
   * painting, unless the selected patch's handles show there to take it; elsewhere it paints, so a new
   * patch can start over another. A second finger belongs to the canvas, which turns a stroke into a
   * pinch.
   */
  function selectPatchAt(event: PointerEvent<HTMLDivElement>) {
    if (
      !containsTarget(event) ||
      event.button !== 0 ||
      !event.isPrimary ||
      event.shiftKey ||
      event.altKey ||
      camera.panMode
    ) {
      return;
    }
    const box = camera.ref.current?.getBoundingClientRect();
    if (!box) return;
    const at: Point = [event.clientX - box.left, event.clientY - box.top];
    const reaches = (anchor?: Point) =>
      anchor !== undefined &&
      Math.hypot(anchor[0] - at[0], anchor[1] - at[1]) <= anchorReach;
    if (
      handled &&
      (reaches(firstShown(handled)) ||
        (handled.mode !== "remove" &&
          handled.id !== resolvingSource &&
          reaches(firstShown(handled, handled.offset))))
    ) {
      return;
    }
    const hit = patches.findLast(
      (patch) => patch.id !== selectedPatch && reaches(firstShown(patch)),
    );
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    selectPatch(hit.id);
  }
  return (
    <div className="absolute inset-0" onPointerDownCapture={selectPatchAt}>
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
          const offset: Point = source
            ? [source[0] - x, source[1] - y]
            : [0, 0];
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
                drawingPatch && selected
                  ? [...selected.strokes, draft]
                  : [draft]
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
            {/* Every other patch shows its first point, which selects it, under the outline shown. */}
            {patches.map((patch) => {
              if (patch.id === visiblePatch) return null;
              const center = firstShown(patch);
              return (
                center && (
                  <HealAnchor
                    key={`anchor-${patch.id}`}
                    kind="destination"
                    center={center}
                  />
                )
              );
            })}
            {patches.map(
              (patch) =>
                visiblePatch === patch.id &&
                !(draft && drawingPatch === patch.id) && (
                  <g key={`outline-${patch.id}`} data-heal-patch={patch.id}>
                    <HealPatchOutline
                      layer={healLayer.id}
                      patch={patch}
                      showSource={
                        patch.id !== drawingPatch &&
                        patch.id !== resolvingSource
                      }
                      interactive={patch.id === handled?.id}
                    />
                  </g>
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
    </div>
  );
}
