import { Button } from "@roprgm/ui/button";
import { Slider } from "@roprgm/ui/slider";
import { useEffect, useRef } from "react";
import { useStore } from "zustand";
import { DockControls } from "@/components/editor/dock";
import { useDocument, useScene } from "@/components/editor/session";
import { barSlider, useBarDensity } from "@/components/editor/toolbar-density";
import { type ColorRange, findLayer, type RangeMask } from "@/core/document";
import { setLayerMask } from "./edits";
import { useMaskTool } from "./mask-tool";
import { rangeParameters } from "./range-parameters";

function RangeColor({ id, mask }: { id: string; mask: ColorRange }) {
  const document = useDocument();
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const input = picker.current;
    const commit = () => document.history.commit();
    input?.addEventListener("change", commit);
    return () => input?.removeEventListener("change", commit);
  }, [document]);
  return (
    <label className="flex items-center gap-2 text-muted">
      Sample
      <input
        ref={picker}
        type="color"
        aria-label="Sample color"
        value={mask.color}
        className="h-6 w-9 cursor-pointer rounded surface-sunken p-0.5"
        onChange={(event) => {
          document.history.begin();
          setLayerMask(document, id, {
            ...mask,
            color: event.currentTarget.value,
          });
        }}
      />
    </label>
  );
}

/** The same range parameters become fields in the canvas bar and dials in the dock. */
export function RangeOptions({ id, mask }: { id: string; mask: RangeMask }) {
  const document = useDocument();
  const density = useBarDensity();
  const parameters = rangeParameters(document, id, mask);
  if (density === "dock") {
    return (
      <DockControls
        parameters={parameters}
        header={
          <>
            {mask.kind === "color-range" && <RangeColor id={id} mask={mask} />}
            {mask.kind === "luminance-range" && <span>Luminance range</span>}
          </>
        }
      />
    );
  }
  return (
    <>
      {mask.kind === "color-range" && <RangeColor id={id} mask={mask} />}
      {parameters.map(({ id, ...parameter }) => (
        <Slider
          key={id}
          {...parameter}
          variant={barSlider(density)}
          valueWidth={3}
        />
      ))}
    </>
  );
}

export function RangeToolOptions({ shape }: { shape: RangeMask["kind"] }) {
  const document = useDocument();
  const tool = useMaskTool();
  const density = useBarDensity();
  const selected = useStore(document.selection, (state) => state.layerId);
  const layer = useScene((scene) => findLayer(scene.layers, selected));
  const mask =
    layer?.kind === "mask" && layer.mask.kind === shape
      ? layer.mask
      : undefined;
  if (mask && density === "dock") {
    return <RangeOptions id={selected} mask={mask} />;
  }
  return (
    <div className="flex items-center gap-2 px-1 text-muted">
      <span>Click the photo to sample</span>
      {mask && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            document.selectLayer(document.scene.getState().layers[0].id);
            tool.edit(shape);
          }}
        >
          New mask
        </Button>
      )}
    </div>
  );
}
